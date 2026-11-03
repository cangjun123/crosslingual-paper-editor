import OpenAI from "openai";
import { ZodError } from "zod";
import type { ApiErrorBody } from "../shared/contracts.js";

const MAX_DETAIL_LENGTH = 300;

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** A non-2xx response from an LLM provider called without an SDK. */
export class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail || `HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

export type NormalizedError = {
  status: number;
  body: ApiErrorBody;
};

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
    };
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message ?? "请求参数无效",
          retryable: false,
        },
      },
    };
  }

  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return providerError("LLM_TIMEOUT", "LLM 服务响应超时，请稍后重试。", true);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return connectionError(error.cause);
  }
  if (error instanceof OpenAI.APIError) {
    return httpProviderError(error.status, openAiDetail(error));
  }
  if (error instanceof ProviderHttpError) {
    return httpProviderError(error.status, error.detail);
  }

  if (error instanceof Error && error.name === "AbortError") {
    return {
      status: 499,
      body: {
        error: {
          code: "REQUEST_ABORTED",
          message: "请求已取消。",
          retryable: true,
        },
      },
    };
  }

  return providerError("INTERNAL_ERROR", "服务发生未知错误，请重试。", true);
}

export function connectionError(cause: unknown): NormalizedError {
  return providerError(
    "LLM_CONNECTION_ERROR",
    `无法连接到 LLM 服务，请检查 Base URL 和网络。${formatDetail(networkErrorCode(cause))}`,
    true,
  );
}

function networkErrorCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return "";
}

function httpProviderError(status: number | undefined, detail: string): NormalizedError {
  const suffix = formatDetail(detail);
  if (status === 401 || status === 403) {
    return providerError("LLM_AUTH_ERROR", `LLM 服务拒绝了凭据，请检查 API key。${suffix}`, false);
  }
  if (status === 429) {
    return {
      status: 429,
      body: {
        error: {
          code: "LLM_RATE_LIMITED",
          message: `LLM 服务当前请求过多，请稍后重试。${suffix}`,
          retryable: true,
        },
      },
    };
  }
  if (status === 404) {
    return providerError(
      "LLM_MODEL_NOT_FOUND",
      `LLM 服务未找到所选模型或接口，请检查模型名称、Base URL 和协议类型。${suffix}`,
      false,
    );
  }
  return providerError(
    "LLM_PROVIDER_ERROR",
    `LLM 服务调用失败${status ? `（${status}）` : ""}。${suffix}`,
    Boolean(!status || status >= 500),
  );
}

function openAiDetail(error: InstanceType<typeof OpenAI.APIError>): string {
  const body: unknown = error.error;
  if (typeof body === "string") {
    return body;
  }
  if (body && typeof body === "object") {
    return extractErrorMessage(JSON.stringify(body));
  }
  return "";
}

function formatDetail(detail: string): string {
  const compact = detail.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  const clipped = compact.length > MAX_DETAIL_LENGTH ? `${compact.slice(0, MAX_DETAIL_LENGTH)}…` : compact;
  return ` 服务返回：${clipped}`;
}

function providerError(code: string, message: string, retryable: boolean): NormalizedError {
  return {
    status: 502,
    body: { error: { code, message, retryable } },
  };
}

/** Pulls a human-readable message out of the error bodies used by OpenAI, Gemini, Anthropic and common relays. */
export function extractErrorMessage(body: string): string {
  const text = body.trim();
  if (!text) {
    return "";
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    const message = findMessage(parsed);
    if (message) {
      return message;
    }
  } catch {
    // Fall through to the raw body for plain-text errors.
  }
  return text;
}

function findMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return findMessage(value[0]);
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.message;
  }
  return findMessage(record.error);
}
