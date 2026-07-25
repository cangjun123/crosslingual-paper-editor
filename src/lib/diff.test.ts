import { describe, expect, it } from "vitest";
import { getChineseDiff, getEnglishDiff, serializeChineseDiff } from "./diff";

describe("diff helpers", () => {
  it("creates character-level Chinese changes", () => {
    const parts = getChineseDiff("适用于所有场景", "仅适用于部分场景");
    expect(parts.some((part) => part.type === "add" && part.value.includes("仅"))).toBe(true);
    expect(parts.some((part) => part.type === "remove" && part.value.includes("所有"))).toBe(true);
  });

  it("preserves a structured serialized diff for the prompt", () => {
    const serialized = serializeChineseDiff("结论很强", "结论较弱");
    const parsed = JSON.parse(serialized) as Array<{ type: string; text: string }>;
    expect(parsed.some((part) => part.type === "remove")).toBe(true);
    expect(parsed.some((part) => part.type === "add")).toBe(true);
  });

  it("retains whitespace in English word diffs", () => {
    const parts = getEnglishDiff("This claim is broad.", "This claim is relatively narrow.");
    expect(parts.filter((part) => part.type !== "add").map((part) => part.value).join("")).toBe(
      "This claim is broad.",
    );
    expect(parts.filter((part) => part.type !== "remove").map((part) => part.value).join("")).toBe(
      "This claim is relatively narrow.",
    );
    expect(parts.some((part) => part.type === "remove" && part.value.includes("broad"))).toBe(true);
  });
});
