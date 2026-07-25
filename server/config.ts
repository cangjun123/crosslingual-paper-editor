import type { ConfigResponse } from "../shared/contracts.js";
import { DEFAULT_MODEL } from "../shared/contracts.js";

export type ServerConfig = {
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

  return {
    apiKey: clean(env.OPENAI_API_KEY),
    baseUrl: clean(env.OPENAI_BASE_URL),
    defaultModel: clean(env.DEFAULT_MODEL) ?? DEFAULT_MODEL,
    port: Number.isInteger(port) && port > 0 && port <= 65_535 ? port : 3001,
    host: clean(env.HOST) ?? "127.0.0.1",
  };
}

export function publicConfig(config: ServerConfig): ConfigResponse {
  return {
    defaultModel: config.defaultModel,
    baseUrlConfigured: Boolean(config.baseUrl),
    apiKeyConfigured: Boolean(config.apiKey),
  };
}
