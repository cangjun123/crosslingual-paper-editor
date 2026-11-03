import type { ConfigResponse } from "../shared/contracts.js";
import { DEFAULT_MODEL } from "../shared/contracts.js";
import { providerSchema, type Provider } from "../shared/providers.js";

export type ServerConfig = {
  provider: Provider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  port: number;
  host: string;
};

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number.parseInt(env.PORT ?? "3001", 10);

  const provider = providerSchema.safeParse(clean(env.LLM_PROVIDER)?.toLowerCase() ?? "openai");

  return {
    provider: provider.success ? provider.data : "openai",
    apiKey: clean(env.LLM_API_KEY) ?? clean(env.OPENAI_API_KEY),
    baseUrl: clean(env.LLM_BASE_URL) ?? clean(env.OPENAI_BASE_URL),
    defaultModel: clean(env.DEFAULT_MODEL) ?? DEFAULT_MODEL,
    port: Number.isInteger(port) && port > 0 && port <= 65_535 ? port : 3001,
    host: clean(env.HOST) ?? "127.0.0.1",
  };
}

export function publicConfig(config: ServerConfig): ConfigResponse {
  return {
    defaultModel: config.defaultModel,
    provider: config.provider,
    baseUrlConfigured: Boolean(config.baseUrl),
    apiKeyConfigured: Boolean(config.apiKey),
  };
}
