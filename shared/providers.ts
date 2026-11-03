import { z } from "zod";

export const PROVIDERS = ["openai", "gemini", "anthropic"] as const;

export const providerSchema = z.enum(PROVIDERS);

export type Provider = z.infer<typeof providerSchema>;

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI 兼容",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

export const PROVIDER_URL_EXAMPLES: Record<Provider, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  anthropic: "https://api.anthropic.com/v1",
};

const DEFAULT_VERSION_PATH: Record<Provider, string> = {
  openai: "/v1",
  gemini: "/v1beta",
  anthropic: "/v1",
};

// Endpoint suffixes users often paste by accident; they are appended again per request.
const ENDPOINT_SUFFIXES: Record<Provider, RegExp> = {
  openai: /\/(chat\/completions|completions|models)$/i,
  gemini: /\/models(\/[^/]*)?$/i,
  anthropic: /\/(messages|models)$/i,
};

/**
 * Turns a user-entered base URL into the versioned API root that request paths are appended to.
 * A bare host gets the provider's default version path, and Gemini relays mounted under a
 * prefix (for example `https://relay.example/gemini`) also get `/v1beta`.
 */
export function resolveBaseUrl(provider: Provider, input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Base URL 格式无效，请以 http:// 或 https:// 开头。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL 只支持 http:// 或 https://。");
  }

  let pathname = url.pathname.replace(/\/+$/, "").replace(ENDPOINT_SUFFIXES[provider], "");
  if (!pathname) {
    pathname = DEFAULT_VERSION_PATH[provider];
  } else if (provider === "gemini" && !/\/v1(alpha|beta)?$/i.test(pathname)) {
    pathname = `${pathname}${DEFAULT_VERSION_PATH.gemini}`;
  }

  return `${url.origin}${pathname}${url.search}`;
}

export function tryResolveBaseUrl(provider: Provider, input: string): string | undefined {
  try {
    return resolveBaseUrl(provider, input);
  } catch {
    return undefined;
  }
}

export const connectionSchema = z
  .object({
    provider: providerSchema.default("openai"),
    baseUrl: z.string().trim().max(2000).default(""),
    apiKey: z.string().trim().max(4000).default(""),
  })
  .superRefine((value, context) => {
    if (!value.baseUrl && !value.apiKey) {
      return;
    }
    if (!value.baseUrl) {
      context.addIssue({ code: "custom", message: "请填写 Base URL，或同时清空 API key 以使用服务器配置。" });
      return;
    }
    if (!value.apiKey) {
      context.addIssue({ code: "custom", message: "请填写 API key，或同时清空 Base URL 以使用服务器配置。" });
      return;
    }
    try {
      resolveBaseUrl(value.provider, value.baseUrl);
    } catch (error) {
      context.addIssue({ code: "custom", message: (error as Error).message });
    }
  });

export type Connection = z.output<typeof connectionSchema>;

export function usesCustomConnection(connection: Pick<Connection, "baseUrl" | "apiKey">): boolean {
  return Boolean(connection.baseUrl.trim() || connection.apiKey.trim());
}
