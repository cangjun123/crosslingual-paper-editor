import {
  appSettingsSchema,
  projectDataSchema,
  type AppSettings,
  type ProjectData,
} from "../../shared/contracts";

export const PROJECT_STORAGE_KEY = "crosslingual-editor:project:v1";
export const SETTINGS_STORAGE_KEY = "crosslingual-editor:settings:v1";

export class PersistenceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PersistenceError";
  }
}

type LoadResult<T> = {
  value?: T;
  error?: string;
};

export function loadProject(): LoadResult<ProjectData> {
  return loadValidated(PROJECT_STORAGE_KEY, projectDataSchema, "本地项目数据已损坏，未自动载入。");
}

export function loadSettings(): LoadResult<AppSettings> {
  return loadValidated(SETTINGS_STORAGE_KEY, appSettingsSchema, "本地设置已损坏，已使用默认设置。");
}

export function saveProject(project: ProjectData): void {
  saveValidated(PROJECT_STORAGE_KEY, projectDataSchema.parse(project));
}

export function saveSettings(settings: AppSettings): void {
  saveValidated(SETTINGS_STORAGE_KEY, appSettingsSchema.parse(settings));
}

export function parseProjectJson(source: string): ProjectData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new PersistenceError("所选文件不是有效的 JSON。", error);
  }

  if (!parsed || typeof parsed !== "object" || !("version" in parsed)) {
    throw new PersistenceError("JSON 中缺少项目版本号。" );
  }
  if ((parsed as { version?: unknown }).version !== 1) {
    throw new PersistenceError(`不支持项目版本 ${(parsed as { version?: unknown }).version ?? "未知"}。`);
  }

  const result = projectDataSchema.safeParse(parsed);
  if (!result.success) {
    throw new PersistenceError("JSON 项目结构无效，未导入任何数据。", result.error);
  }
  return result.data;
}

export function downloadProject(project: ProjectData): void {
  const blob = new Blob([`${JSON.stringify(projectDataSchema.parse(project), null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `crosslingual-paper-editor-${fileTimestamp(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadValidated<T>(
  key: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  errorMessage: string,
): LoadResult<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? { value: parsed.data } : { error: errorMessage };
  } catch {
    return { error: errorMessage };
  }
}

function saveValidated(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    const quota = error instanceof DOMException && error.name === "QuotaExceededError";
    throw new PersistenceError(
      quota
        ? "浏览器存储空间不足。当前内容仍在页面中，请尽快导出 JSON。"
        : "无法写入浏览器本地存储，请检查浏览器设置。",
      error,
    );
  }
}

function fileTimestamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}
