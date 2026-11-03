// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeError } from "./errors.js";
import { createLlmService, type GenerationParams } from "./llm.js";

const params: GenerationParams = {
  model: "test-model",
  temperature: 1.4,
  messages: [
    { role: "system", content: "System rules." },
    { role: "user", content: "User prompt." },
  ],
};

type Captured = { url: string; init: RequestInit };

function stubFetch(...responses: Response[]): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      const response = responses.shift();
      if (!response) {
        throw new Error("unexpected fetch");
      }
      return response;
    }),
  );
  return calls;
}

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const parts: string[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

describe("Gemini service", () => {
  afterEach(() => vi.unstubAllGlobals());

  const gemini = () =>
    createLlmService({ provider: "gemini", baseUrl: "https://relay.test/gemini", apiKey: "g-key" });

  it("sends system instructions separately and skips thought parts", async () => {
    const calls = stubFetch(
      Response.json({
        candidates: [{ content: { parts: [{ text: "plan", thought: true }, { text: "答案" }, { text: "。" }] } }],
      }),
    );

    await expect(gemini().complete(params)).resolves.toBe("答案。");

    expect(calls[0]?.url).toBe("https://relay.test/gemini/v1beta/models/test-model:generateContent");
    expect(new Headers(calls[0]?.init.headers).get("x-goog-api-key")).toBe("g-key");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      systemInstruction: { parts: [{ text: "System rules." }] },
      contents: [{ role: "user", parts: [{ text: "User prompt." }] }],
      generationConfig: { temperature: 1.4 },
    });
  });

  it("streams text from SSE chunks", async () => {
    const calls = stubFetch(
      sse([
        { candidates: [{ content: { parts: [{ text: "第一" }] } }] },
        { candidates: [{ content: { parts: [{ text: "段" }] }, finishReason: "STOP" }] },
      ]),
    );

    await expect(collect(gemini().stream(params))).resolves.toEqual(["第一", "段"]);
    expect(calls[0]?.url).toBe(
      "https://relay.test/gemini/v1beta/models/test-model:streamGenerateContent?alt=sse",
    );
  });

  it("reports blocked prompts", async () => {
    stubFetch(Response.json({ promptFeedback: { blockReason: "SAFETY" } }));
    await expect(gemini().complete(params)).rejects.toMatchObject({ code: "LLM_BLOCKED" });
  });

  it("lists generateContent models without the models/ prefix", async () => {
    stubFetch(
      Response.json({
        models: [
          { name: "models/gemini-pro", supportedGenerationMethods: ["generateContent"] },
          { name: "models/embedding", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    );
    await expect(gemini().listModels!()).resolves.toEqual(["gemini-pro"]);
  });
});

describe("Anthropic service", () => {
  afterEach(() => vi.unstubAllGlobals());

  const anthropic = () =>
    createLlmService({ provider: "anthropic", baseUrl: "https://api.anthropic.test", apiKey: "a-key" });

  it("uses the Messages API with a top-level system prompt and clamped temperature", async () => {
    const calls = stubFetch(
      Response.json({ content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "Revised." }] }),
    );

    await expect(anthropic().complete(params)).resolves.toBe("Revised.");

    expect(calls[0]?.url).toBe("https://api.anthropic.test/v1/messages");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("x-api-key")).toBe("a-key");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      model: "test-model",
      system: "System rules.",
      temperature: 1,
      messages: [{ role: "user", content: "User prompt." }],
      stream: false,
    });
  });

  it("streams text deltas and surfaces stream errors", async () => {
    stubFetch(
      sse([
        { type: "message_start" },
        { type: "content_block_delta", delta: { type: "text_delta", text: "Re" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "vised" } },
        { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
      ]),
    );

    const received: string[] = [];
    const error = await (async () => {
      try {
        for await (const part of anthropic().stream(params)) {
          received.push(part);
        }
      } catch (caught) {
        return caught;
      }
    })();

    expect(received).toEqual(["Re", "vised"]);
    expect(normalizeError(error).body.error.message).toContain("Overloaded");
  });
});

describe("provider errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes the relay's error message", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "没有可用的 provider 支持模型 'x'" }), { status: 404 }),
    );
    const service = createLlmService({ provider: "gemini", baseUrl: "https://relay.test", apiKey: "k" });
    const error = await service.complete(params).catch((caught: unknown) => caught);

    expect(normalizeError(error).body.error).toMatchObject({
      code: "LLM_MODEL_NOT_FOUND",
      message: expect.stringContaining("没有可用的 provider 支持模型 'x'"),
    });
  });

  it("maps OpenAI-compatible authentication failures", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { message: "Invalid token", type: "auth" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const service = createLlmService({ provider: "openai", baseUrl: "https://relay.test", apiKey: "k" });
    const error = await service.complete(params).catch((caught: unknown) => caught);

    expect(normalizeError(error).body.error).toMatchObject({
      code: "LLM_AUTH_ERROR",
      message: expect.stringContaining("Invalid token"),
    });
  });

  it("treats an empty OpenAI-compatible body as an empty response", async () => {
    stubFetch(new Response("", { status: 200 }));
    const service = createLlmService({ provider: "openai", baseUrl: "https://relay.test", apiKey: "k" });
    const error = await service.complete(params).catch((caught: unknown) => caught);

    expect(normalizeError(error).body.error.code).toBe("LLM_EMPTY_RESPONSE");
  });

  it("reports unreachable hosts with the network error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("refused"), { code: "ECONNREFUSED" }) });
      }),
    );
    const service = createLlmService({ provider: "anthropic", baseUrl: "https://relay.test", apiKey: "k" });
    const error = await service.complete(params).catch((caught: unknown) => caught);

    expect(normalizeError(error).body.error).toMatchObject({
      code: "LLM_CONNECTION_ERROR",
      message: expect.stringContaining("ECONNREFUSED"),
    });
  });
});
