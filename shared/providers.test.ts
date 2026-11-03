// @vitest-environment node
import { describe, expect, it } from "vitest";
import { connectionSchema, resolveBaseUrl } from "./providers.js";

describe("resolveBaseUrl", () => {
  it.each([
    ["openai", "http://39.102.124.3:18101", "http://39.102.124.3:18101/v1"],
    ["openai", "https://api.openai.com/v1/", "https://api.openai.com/v1"],
    ["openai", "https://relay.test/v1/chat/completions", "https://relay.test/v1"],
    ["openai", "https://open.bigmodel.cn/api/paas/v4", "https://open.bigmodel.cn/api/paas/v4"],
    ["gemini", "https://generativelanguage.googleapis.com", "https://generativelanguage.googleapis.com/v1beta"],
    ["gemini", "https://relay.test/gemini", "https://relay.test/gemini/v1beta"],
    ["gemini", "https://relay.test/gemini/v1beta/models", "https://relay.test/gemini/v1beta"],
    ["gemini", "https://relay.test/v1", "https://relay.test/v1"],
    ["anthropic", "https://api.anthropic.com", "https://api.anthropic.com/v1"],
    ["anthropic", "https://relay.test/v1/messages", "https://relay.test/v1"],
  ] as const)("%s %s", (provider, input, expected) => {
    expect(resolveBaseUrl(provider, input)).toBe(expected);
  });

  it("rejects non-HTTP URLs", () => {
    expect(() => resolveBaseUrl("openai", "relay.test/v1")).toThrow("Base URL");
    expect(() => resolveBaseUrl("openai", "file:///etc/passwd")).toThrow("http");
  });
});

describe("connectionSchema", () => {
  it("accepts an empty connection so the server configuration is used", () => {
    expect(connectionSchema.safeParse({ provider: "openai", baseUrl: "", apiKey: "" }).success).toBe(true);
  });

  it("requires the URL and key together", () => {
    expect(connectionSchema.safeParse({ baseUrl: "https://relay.test", apiKey: "" }).success).toBe(false);
    expect(connectionSchema.safeParse({ baseUrl: "", apiKey: "key" }).success).toBe(false);
  });
});
