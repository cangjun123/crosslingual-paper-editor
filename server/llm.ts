import OpenAI from "openai";
import type { ChatMessage } from "./prompts.js";
import type { ServerConfig } from "./config.js";
import { AppError } from "./errors.js";

export type GenerationParams = {
  model: string;
  temperature: number;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export interface LlmService {
  complete(params: GenerationParams): Promise<string>;
  stream(params: GenerationParams): AsyncIterable<string>;
}

export class OpenAiLlmService implements LlmService {
  private readonly client: OpenAI;

  constructor(config: ServerConfig) {
    if (!config.apiKey || !config.baseUrl) {
      throw new AppError(
        503,
        "CONFIG_MISSING",
        "LLM 配置不完整，请在后端 .env 中设置 OPENAI_API_KEY 和 OPENAI_BASE_URL。",
      );
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: 180_000,
      maxRetries: 0,
    });
  }

  async complete(params: GenerationParams): Promise<string> {
    const completion = await this.client.chat.completions.create(
      {
        model: params.model,
        temperature: params.temperature,
        messages: params.messages,
        stream: false,
      },
      { signal: params.signal },
    );

    const content = completion.choices[0]?.message.content?.trim();
    if (!content) {
      throw new AppError(502, "LLM_EMPTY_RESPONSE", "LLM 服务返回了空内容，请重试。", true);
    }
    return content;
  }

  async *stream(params: GenerationParams): AsyncIterable<string> {
    const response = await this.client.chat.completions.create(
      {
        model: params.model,
        temperature: params.temperature,
        messages: params.messages,
        stream: true,
      },
      { signal: params.signal },
    );

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
