import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../shared/contracts";
import {
  PersistenceError,
  PROJECT_STORAGE_KEY,
  loadProject,
  parseProjectJson,
  saveProject,
} from "./storage";

describe("project persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a version 1 project", () => {
    const project = createEmptyProject("test-model");
    project.current.originalEnglish = "Original.";
    saveProject(project);

    expect(loadProject().value).toEqual(project);
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toContain('"version":1');
  });

  it("rejects unsupported imported versions", () => {
    expect(() => parseProjectJson('{"version":2,"current":{},"history":[]}')).toThrow(
      "不支持项目版本 2",
    );
  });

  it("rejects malformed JSON without changing storage", () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, '{"version":1}');
    expect(() => parseProjectJson("not json")).toThrow("不是有效的 JSON");
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe('{"version":1}');
  });

  it("turns quota errors into an actionable persistence error", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => saveProject(createEmptyProject())).toThrow(PersistenceError);
    expect(() => saveProject(createEmptyProject())).toThrow("导出 JSON");
  });
});
