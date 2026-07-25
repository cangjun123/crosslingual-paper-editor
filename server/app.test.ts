// @vitest-environment node
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "./config.js";
import { createApp } from "./app.js";
import type { GenerationParams, LlmService } from "./llm.js";

const configured: ServerConfig = {
  apiKey: "test-key",
  baseUrl: "https://example.test/v1",
  defaultModel: "default-test-model",
  port: 3001,
  host: "127.0.0.1",
};

class FakeLlm implements LlmService {
  complete = vi.fn(async (_params: GenerationParams) => "测试内容");

  async *stream(_params: GenerationParams): AsyncIterable<string> {
    yield "修改后的";
    yield " English.";
  }
}

describe("API", () => {
  it("provides a configuration-independent health check", async () => {
    const response = await request(
      createApp({ config: { ...configured, apiKey: undefined, baseUrl: undefined } }),
    )
      .get("/api/health")
      .expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns only non-sensitive configuration", async () => {
    const response = await request(createApp({ config: configured, llm: new FakeLlm() }))
      .get("/api/config")
      .expect(200);

    expect(response.body).toEqual({
      defaultModel: "default-test-model",
      baseUrlConfigured: true,
      apiKeyConfigured: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("test-key");
    expect(JSON.stringify(response.body)).not.toContain("example.test");
  });

  it("returns the documented JSON shape when streaming is disabled", async () => {
    const llm = new FakeLlm();
    const response = await request(createApp({ config: configured, llm }))
      .post("/api/translate-to-chinese")
      .send({
        originalEnglish: "An academic sentence.",
        model: "test-model",
        temperature: 0.2,
        stream: false,
      })
      .expect(200);

    expect(response.body).toEqual({ originalChinese: "测试内容" });
    expect(llm.complete).toHaveBeenCalledOnce();
  });

  it("streams structured delta and done events", async () => {
    const response = await request(createApp({ config: configured, llm: new FakeLlm() }))
      .post("/api/revise-english")
      .send({
        originalEnglish: "Original English.",
        originalChinese: "原始中文。",
        editedChinese: "修改中文。",
        chineseDiff: "[]",
        model: "test-model",
        temperature: 0.2,
        stream: true,
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.text).toContain('event: delta\ndata: {"text":"修改后的"}');
    expect(response.text).toContain('event: done\ndata: {"text":"修改后的 English."}');
  });

  it("rejects invalid generation inputs", async () => {
    const response = await request(createApp({ config: configured, llm: new FakeLlm() }))
      .post("/api/translate-to-chinese")
      .send({ originalEnglish: "", model: "", stream: false, temperature: 0.2 })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.retryable).toBe(false);
  });

  it("reports missing backend configuration without exposing details", async () => {
    const response = await request(
      createApp({ config: { ...configured, apiKey: undefined, baseUrl: undefined } }),
    )
      .post("/api/translate-to-chinese")
      .send({
        originalEnglish: "An academic sentence.",
        model: "test-model",
        temperature: 0.2,
        stream: false,
      })
      .expect(503);

    expect(response.body.error.code).toBe("CONFIG_MISSING");
    expect(JSON.stringify(response.body)).not.toContain("undefined");
  });

  it("tests the selected model through the same service", async () => {
    const llm = new FakeLlm();
    const response = await request(createApp({ config: configured, llm }))
      .post("/api/test-llm")
      .send({ model: "selected-model", temperature: 0.4 })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.model).toBe("selected-model");
    expect(response.body.latencyMs).toEqual(expect.any(Number));
    expect(llm.complete.mock.calls[0]?.[0].model).toBe("selected-model");
  });
});
