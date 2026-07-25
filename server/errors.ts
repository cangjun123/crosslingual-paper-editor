import OpenAI from "openai";
import { ZodError } from "zod";
import type { ApiErrorBody } from "../shared/contracts.js";

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

  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return providerError("LLM_AUTH_ERROR", "LLM 服务拒绝了凭据，请检查 API key。", false);
    }
    if (error.status === 429) {
      return {
        status: 429,
        body: {
          error: {
            code: "LLM_RATE_LIMITED",
            message: "LLM 服务当前请求过多，请稍后重试。",
            retryable: true,
          },
        },
      };
    }
    if (error.status === 404) {
      return providerError("LLM_MODEL_NOT_FOUND", "LLM 服务未找到所选模型，请检查模型名称。", false);
    }
    return providerError(
      "LLM_PROVIDER_ERROR",
      `LLM 服务调用失败${error.status ? `（${error.status}）` : ""}。`,
      Boolean(error.status && error.status >= 500),
    );
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

function providerError(code: string, message: string, retryable: boolean): NormalizedError {
  return {
    status: 502,
    body: { error: { code, message, retryable } },
  };
}
