import { createParser, type EventSourceMessage } from "eventsource-parser";
import type {
  ApiErrorBody,
  ConfigResponse,
  ParsedReviseRequest,
  ParsedTranslateRequest,
  TestLlmRequest,
} from "../../shared/contracts";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code = "REQUEST_FAILED",
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function fetchConfig(signal?: AbortSignal): Promise<ConfigResponse> {
  const response = await fetch("/api/config", { signal });
  if (!response.ok) {
    throw await readError(response);
  }
  return response.json() as Promise<ConfigResponse>;
}

export async function translateToChinese(
  request: ParsedTranslateRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  return generate("/api/translate-to-chinese", request, "originalChinese", onDelta, signal);
}

export async function reviseEnglish(
  request: ParsedReviseRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  return generate("/api/revise-english", request, "revisedEnglish", onDelta, signal);
}

export async function testLlm(
  request: TestLlmRequest,
  signal?: AbortSignal,
): Promise<{ ok: true; model: string; latencyMs: number }> {
  const response = await fetch("/api/test-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return response.json() as Promise<{ ok: true; model: string; latencyMs: number }>;
}

async function generate<T extends { stream: boolean }>(
  url: string,
  request: T,
  responseKey: "originalChinese" | "revisedEnglish",
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw await readError(response);
  }

  if (!request.stream) {
    const body = (await response.json()) as Record<string, unknown>;
    const text = body[responseKey];
    if (typeof text !== "string" || !text.trim()) {
      throw new ApiClientError("LLM 服务返回了无效内容。", "INVALID_RESPONSE", true);
    }
    return text;
  }

  if (!response.body) {
    throw new ApiClientError("浏览器未收到流式响应。", "STREAM_UNAVAILABLE", true);
  }

  let accumulated = "";
  let completed: string | undefined;
  let streamError: ApiClientError | undefined;

  const parser = createParser({
    onEvent(event: EventSourceMessage) {
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        streamError = new ApiClientError("流式响应格式无效。", "INVALID_STREAM", true);
        return;
      }

      if (event.event === "delta" && hasText(data)) {
        accumulated += data.text;
        onDelta(accumulated);
      } else if (event.event === "done" && hasText(data)) {
        completed = data.text;
        onDelta(completed);
      } else if (event.event === "error" && hasApiError(data)) {
        streamError = new ApiClientError(
          data.error.message,
          data.error.code,
          data.error.retryable,
          200,
        );
      }
    },
    onError() {
      streamError = new ApiClientError("无法解析流式响应。", "INVALID_STREAM", true);
    },
  });

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    parser.feed(value);
    if (streamError) {
      await reader.cancel();
      throw streamError;
    }
  }
  parser.reset({ consume: true });

  if (streamError) {
    throw streamError;
  }
  const text = completed ?? accumulated.trim();
  if (!text) {
    throw new ApiClientError("流式响应未包含生成内容。", "EMPTY_STREAM", true);
  }
  return text;
}

async function readError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error?.message) {
      return new ApiClientError(
        body.error.message,
        body.error.code,
        body.error.retryable,
        response.status,
      );
    }
  } catch {
    // Use the status fallback below when an intermediary returns non-JSON.
  }
  return new ApiClientError(`请求失败（${response.status}）。`, "HTTP_ERROR", response.status >= 500, response.status);
}

function hasText(value: unknown): value is { text: string } {
  return Boolean(value && typeof value === "object" && "text" in value && typeof value.text === "string");
}

function hasApiError(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object" || !("error" in value)) {
    return false;
  }
  const error = value.error;
  return Boolean(
    error &&
      typeof error === "object" &&
      "message" in error &&
      "code" in error &&
      "retryable" in error,
  );
}
