import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ApiErrorBody } from "../shared/contracts.js";
import {
  listModelsRequestSchema,
  reviseRequestSchema,
  testLlmRequestSchema,
  translateRequestSchema,
} from "../shared/contracts.js";
import { usesCustomConnection, type Connection } from "../shared/providers.js";
import type { ServerConfig } from "./config.js";
import { publicConfig } from "./config.js";
import { AppError, normalizeError } from "./errors.js";
import {
  createLlmService,
  type GenerationParams,
  type LlmService,
  type ResolvedConnection,
} from "./llm.js";
import { buildRevisionMessages, buildTranslationMessages, type ChatMessage } from "./prompts.js";

type AppDependencies = {
  config: ServerConfig;
  createLlm?: (connection: ResolvedConnection) => LlmService;
  clientDist?: string;
};

type LlmResolver = (connection: Connection | undefined) => LlmService;

type GenerationHandlerOptions<T> = {
  parse: (body: unknown) => T;
  messages: (input: T) => ChatMessage[];
  responseKey: "originalChinese" | "revisedEnglish";
};

type GenerationInput = {
  model: string;
  temperature: number;
  stream: boolean;
  connection?: Connection;
};

export function createApp({
  config,
  createLlm = createLlmService,
  clientDist,
}: AppDependencies): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "5mb" }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  // Browser-supplied credentials are used as a complete set; the server key is never sent to a
  // browser-supplied URL.
  const getLlm: LlmResolver = (connection) => {
    if (connection && usesCustomConnection(connection)) {
      return createLlm(connection);
    }
    if (!config.apiKey || !config.baseUrl) {
      throw new AppError(
        503,
        "CONFIG_MISSING",
        "尚未配置模型服务，请在设置中填写 Base URL 和 API key。",
      );
    }
    try {
      return createLlm({ provider: config.provider, baseUrl: config.baseUrl, apiKey: config.apiKey });
    } catch (error) {
      throw new AppError(
        503,
        "CONFIG_INVALID",
        `后端 .env 中的 LLM 配置无效：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  };

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/config", (_request, response) => {
    response.json(publicConfig(config));
  });

  app.post(
    "/api/translate-to-chinese",
    generationHandler(getLlm, {
      parse: (body) => translateRequestSchema.parse(body),
      messages: buildTranslationMessages,
      responseKey: "originalChinese",
    }),
  );

  app.post(
    "/api/revise-english",
    generationHandler(getLlm, {
      parse: (body) => reviseRequestSchema.parse(body),
      messages: buildRevisionMessages,
      responseKey: "revisedEnglish",
    }),
  );

  app.post("/api/test-llm", async (request, response, next) => {
    try {
      const input = testLlmRequestSchema.parse(request.body);
      const llm = getLlm(input.connection);
      const startedAt = performance.now();
      await llm.complete({
        model: input.model,
        temperature: input.temperature,
        messages: [
          { role: "system", content: "You are a connection test." },
          { role: "user", content: "Reply with OK only." },
        ],
      });
      response.json({
        ok: true,
        model: input.model,
        latencyMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/models", async (request, response, next) => {
    try {
      const input = listModelsRequestSchema.parse(request.body ?? {});
      const llm = getLlm(input.connection);
      if (!llm.listModels) {
        throw new AppError(501, "NOT_SUPPORTED", "当前服务不支持获取模型列表。");
      }
      const models = [...new Set(await llm.listModels())].sort((a, b) => a.localeCompare(b));
      response.json({ models });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "API 路径不存在。", retryable: false },
    } satisfies ApiErrorBody);
  });

  const staticRoot = clientDist ?? path.resolve(process.cwd(), "dist");
  if (existsSync(staticRoot)) {
    app.use(express.static(staticRoot, { index: false }));
    app.use((request, response, next) => {
      if (request.method === "GET" && request.accepts("html")) {
        response.sendFile(path.join(staticRoot, "index.html"));
        return;
      }
      next();
    });
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const normalized = normalizeError(error);
    response.status(normalized.status).json(normalized.body);
  });

  return app;
}

function generationHandler<T extends GenerationInput>(
  getLlm: LlmResolver,
  options: GenerationHandlerOptions<T>,
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    let input: T;
    let llm: LlmService;
    try {
      input = options.parse(request.body);
      llm = getLlm(input.connection);
    } catch (error) {
      next(error);
      return;
    }

    const abortController = new AbortController();
    request.once("aborted", () => abortController.abort());
    response.once("close", () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    });

    const params: GenerationParams = {
      model: input.model,
      temperature: input.temperature,
      messages: options.messages(input),
      signal: abortController.signal,
    };

    if (!input.stream) {
      try {
        const text = await llm.complete(params);
        response.json({ [options.responseKey]: text });
      } catch (error) {
        if (abortController.signal.aborted || response.destroyed) {
          return;
        }
        next(error);
      }
      return;
    }

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    let fullText = "";
    try {
      for await (const delta of llm.stream(params)) {
        fullText += delta;
        writeSse(response, "delta", { text: delta });
      }

      const finalText = fullText.trim();
      if (!finalText) {
        throw new AppError(502, "LLM_EMPTY_RESPONSE", "LLM 服务返回了空内容，请重试。", true);
      }
      writeSse(response, "done", { text: finalText });
      response.end();
    } catch (error) {
      if (abortController.signal.aborted) {
        response.end();
        return;
      }
      const normalized = normalizeError(error);
      writeSse(response, "error", normalized.body);
      response.end();
    }
  };
}

function writeSse(response: Response, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
