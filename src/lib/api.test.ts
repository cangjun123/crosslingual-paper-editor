// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, translateToChinese } from "./api";

describe("streaming API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses SSE deltas into a final result", async () => {
    const body = [
      'event: delta\ndata: {"text":"忠实"}\n\n',
      'event: delta\ndata: {"text":"翻译"}\n\n',
      'event: done\ndata: {"text":"忠实翻译"}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const previews: string[] = [];

    const result = await translateToChinese(
      {
        originalEnglish: "Faithful translation.",
        model: "test-model",
        temperature: 0.2,
        stream: true,
      },
      (text) => previews.push(text),
      new AbortController().signal,
    );

    expect(result).toBe("忠实翻译");
    expect(previews).toEqual(["忠实", "忠实翻译", "忠实翻译"]);
  });

  it("surfaces structured errors from a stream", async () => {
    const body = 'event: error\ndata: {"error":{"code":"LLM_RATE_LIMITED","message":"稍后重试","retryable":true}}\n\n';
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    await expect(
      translateToChinese(
        {
          originalEnglish: "Paragraph.",
          model: "test-model",
          temperature: 0.2,
          stream: true,
        },
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "LLM_RATE_LIMITED", retryable: true } satisfies Partial<ApiClientError>);
  });
});
