import { z } from "zod";

export const editorStateSchema = z.object({
  originalEnglish: z.string(),
  fullPaperContext: z.string().optional(),
  originalChinese: z.string(),
  editedChinese: z.string(),
  extraInstruction: z.string().optional(),
  revisedEnglish: z.string(),
  model: z.string(),
});

export type EditorState = z.infer<typeof editorStateSchema>;

export const historyItemSchema = z.object({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  model: z.string(),
  originalEnglish: z.string(),
  fullPaperContext: z.string().optional(),
  originalChinese: z.string(),
  editedChinese: z.string(),
  chineseDiff: z.string().optional(),
  extraInstruction: z.string().optional(),
  revisedEnglish: z.string(),
});

export type HistoryItem = z.infer<typeof historyItemSchema>;

export const projectDataSchema = z.object({
  version: z.literal(1),
  current: editorStateSchema,
  history: z.array(historyItemSchema),
});

export type ProjectData = z.infer<typeof projectDataSchema>;

export const appSettingsSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2),
  stream: z.boolean(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const generationOptionsSchema = z.object({
  model: z.string().trim().min(1, "请输入模型名称").max(200),
  temperature: z.number().min(0).max(2).default(0.2),
  stream: z.boolean().default(true),
});

export const translateRequestSchema = generationOptionsSchema.extend({
  originalEnglish: z.string().trim().min(1, "原英文段落不能为空"),
});

export type TranslateRequest = z.input<typeof translateRequestSchema>;
export type ParsedTranslateRequest = z.output<typeof translateRequestSchema>;

export const reviseRequestSchema = generationOptionsSchema.extend({
  originalEnglish: z.string().trim().min(1, "原英文段落不能为空"),
  fullPaperContext: z.string().optional(),
  originalChinese: z.string().trim().min(1, "请先生成中文译文"),
  editedChinese: z.string().trim().min(1, "编辑后的中文不能为空"),
  chineseDiff: z.string(),
  extraInstruction: z.string().optional(),
});

export type ReviseRequest = z.input<typeof reviseRequestSchema>;
export type ParsedReviseRequest = z.output<typeof reviseRequestSchema>;

export const testLlmRequestSchema = generationOptionsSchema.pick({
  model: true,
  temperature: true,
});

export type TestLlmRequest = z.input<typeof testLlmRequestSchema>;

export type ConfigResponse = {
  defaultModel: string;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string }
  | { type: "error"; error: ApiErrorBody["error"] };

export const DEFAULT_MODEL = "gpt-4.1";
export const DEFAULT_SETTINGS: AppSettings = {
  model: DEFAULT_MODEL,
  temperature: 0.2,
  stream: true,
};

export function createEmptyEditorState(model = DEFAULT_MODEL): EditorState {
  return {
    originalEnglish: "",
    fullPaperContext: "",
    originalChinese: "",
    editedChinese: "",
    extraInstruction: "",
    revisedEnglish: "",
    model,
  };
}

export function createEmptyProject(model = DEFAULT_MODEL): ProjectData {
  return {
    version: 1,
    current: createEmptyEditorState(model),
    history: [],
  };
}
