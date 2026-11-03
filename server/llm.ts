import OpenAI from "openai";
import { createParser, type EventSourceMessage } from "eventsource-parser";
import type { Provider } from "../shared/providers.js";
import { resolveBaseUrl } from "../shared/providers.js";
import type { ChatMessage } from "./prompts.js";
import { AppError, ProviderHttpError, connectionError, extractErrorMessage } from "./errors.js";

const REQUEST_TIMEOUT_MS = 180_000;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MAX_TOKENS = 8192;

export type GenerationParams = {
  model: string;
  temperature: number;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export interface LlmService {
  complete(params: GenerationParams): Promise<string>;
  stream(params: GenerationParams): AsyncIterable<string>;
  listModels?(signal?: AbortSignal): Promise<string[]>;
}

export type ResolvedConnection = {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
};

export function createLlmService(connection: ResolvedConnection): LlmService {
  const resolved = { ...connection, baseUrl: resolveBaseUrl(connection.provider, connection.baseUrl) };
  switch (resolved.provider) {
    case "gemini":
      return new GeminiLlmService(resolved);
    case "anthropic":
      return new AnthropicLlmService(resolved);
    default:
      return new OpenAiLlmService(resolved);
  }
}

export class OpenAiLlmService implements LlmService {
  private readonly client: OpenAI;

  constructor(connection: ResolvedConnection) {
    this.client = new OpenAI({
      apiKey: connection.apiKey,
      baseURL: connection.baseUrl,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });
  }

  async complete(params: GenerationParams): Promise<string> {
    const completion = await this.client.chat.completions.create(
      {
        model: params.model,
        temperature: params.temperature,
        messages: params.messages,
        stream: false,
      },
      { signal: params.signal },
    );

    // Some relays answer 200 with an empty body, which the SDK surfaces as a falsy completion.
    return requireText(completion?.choices?.[0]?.message?.content);
  }

  async *stream(params: GenerationParams): AsyncIterable<string> {
    const response = await this.client.chat.completions.create(
      {
        model: params.model,
        temperature: params.temperature,
        messages: params.messages,
        stream: true,
      },
      { signal: params.signal },
    );

    for await (const chunk of response) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const ids: string[] = [];
    for await (const model of this.client.models.list({ signal })) {
      ids.push(model.id);
    }
    return ids;
  }
}

type GeminiPart = { text?: string; thought?: boolean };

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
};

export class GeminiLlmService implements LlmService {
  constructor(private readonly connection: ResolvedConnection) {}

  async complete(params: GenerationParams): Promise<string> {
    const response = await this.post(params, "generateContent");
    return requireText(geminiText(await readJson<GeminiResponse>(response)));
  }

  async *stream(params: GenerationParams): AsyncIterable<string> {
    const response = await this.post(params, "streamGenerateContent?alt=sse");
    for await (const event of readSse(response)) {
      const text = geminiText(parseEventJson<GeminiResponse>(event));
      if (text) {
        yield text;
      }
    }
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ pageSize: "1000" });
      if (pageToken) {
        query.set("pageToken", pageToken);
      }
      const response = await send(`${this.connection.baseUrl}/models?${query}`, {
        headers: { "x-goog-api-key": this.connection.apiKey },
        signal,
      });
      const body = await readJson<{
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        nextPageToken?: string;
      }>(response);
      for (const model of body.models ?? []) {
        const methods = model.supportedGenerationMethods;
        if (model.name && (!methods || methods.includes("generateContent"))) {
          ids.push(model.name.replace(/^models\//, ""));
        }
      }
      pageToken = body.nextPageToken;
    } while (pageToken);
    return ids;
  }

  private post(params: GenerationParams, method: string): Promise<Response> {
    const system = params.messages.filter((message) => message.role === "system");
    const body = {
      ...(system.length > 0 && {
        systemInstruction: { parts: system.map((message) => ({ text: message.content })) },
      }),
      contents: params.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: "user", parts: [{ text: message.content }] })),
      generationConfig: { temperature: params.temperature },
    };
    const model = encodeURIComponent(params.model.replace(/^models\//, ""));
    return send(`${this.connection.baseUrl}/models/${model}:${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.connection.apiKey },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  }
}

function geminiText(response: GeminiResponse): string {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new AppError(502, "LLM_BLOCKED", `Gemini 拒绝了该请求（${blockReason}）。`);
  }
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicStreamEvent = {
  type?: string;
  delta?: { type?: string; text?: string };
  error?: { type?: string; message?: string };
};

export class AnthropicLlmService implements LlmService {
  constructor(private readonly connection: ResolvedConnection) {}

  async complete(params: GenerationParams): Promise<string> {
    const response = await this.post(params, false);
    const body = await readJson<{ content?: AnthropicContentBlock[] }>(response);
    return requireText(
      (body.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join(""),
    );
  }

  async *stream(params: GenerationParams): AsyncIterable<string> {
    const response = await this.post(params, true);
    for await (const event of readSse(response)) {
      const data = parseEventJson<AnthropicStreamEvent>(event);
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta" && data.delta.text) {
        yield data.delta.text;
      } else if (data.type === "error") {
        throw new ProviderHttpError(502, data.error?.message ?? "Anthropic 流式响应返回错误。");
      }
    }
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await send(`${this.connection.baseUrl}/models?limit=1000`, {
      headers: this.headers(),
      signal,
    });
    const body = await readJson<{ data?: Array<{ id?: string }> }>(response);
    return (body.data ?? []).flatMap((model) => (model.id ? [model.id] : []));
  }

  private post(params: GenerationParams, stream: boolean): Promise<Response> {
    const system = params.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    return send(`${this.connection.baseUrl}/messages`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        // The Messages API accepts temperatures up to 1.
        temperature: Math.min(params.temperature, 1),
        ...(system && { system }),
        messages: params.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: "user", content: message.content })),
        stream,
      }),
      signal: params.signal,
    });
  }

  private headers(): Record<string, string> {
    return { "x-api-key": this.connection.apiKey, "anthropic-version": ANTHROPIC_VERSION };
  }
}

function requireText(content: string | null | undefined): string {
  const text = content?.trim();
  if (!text) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", "LLM 服务返回了空内容，请重试。", true);
  }
  return text;
}

/** Fetches with a timeout that only covers waiting for response headers, so long streams are not cut off. */
async function send(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (init.signal?.aborted) {
      throw error;
    }
    if (timeout.signal.aborted) {
      throw new AppError(504, "LLM_TIMEOUT", "LLM 服务响应超时，请稍后重试。", true);
    }
    const { status, body } = connectionError(error);
    throw new AppError(status, body.error.code, body.error.message, body.error.retryable);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ProviderHttpError(response.status, extractErrorMessage(await response.text()));
  }
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", "LLM 服务返回了空内容，请重试。", true);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError(502, "LLM_INVALID_RESPONSE", "LLM 服务返回了无法解析的内容，请检查 Base URL 和协议类型。", true);
  }
}

function parseEventJson<T>(event: EventSourceMessage): T {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    throw new AppError(502, "LLM_INVALID_RESPONSE", "LLM 服务返回了无法解析的流式内容。", true);
  }
}

async function* readSse(response: Response): AsyncIterable<EventSourceMessage> {
  if (!response.body) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", "LLM 服务未返回流式内容。", true);
  }
  const queue: EventSourceMessage[] = [];
  const parser = createParser({
    onEvent: (event) => {
      if (event.data && event.data !== "[DONE]") {
        queue.push(event);
      }
    },
  });
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    parser.feed(decoder.decode(chunk, { stream: true }));
    while (queue.length > 0) {
      yield queue.shift()!;
    }
  }
  parser.feed(decoder.decode());
  parser.reset({ consume: true });
  yield* queue;
}
