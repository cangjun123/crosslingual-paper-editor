import { diffChars, diffWordsWithSpace } from "diff";

export type DiffKind = "equal" | "add" | "remove";

export type DiffPart = {
  type: DiffKind;
  value: string;
};

function normalize(parts: Array<{ value: string; added?: boolean; removed?: boolean }>): DiffPart[] {
  return parts.map((part) => ({
    type: part.added ? "add" : part.removed ? "remove" : "equal",
    value: part.value,
  }));
}

export function getChineseDiff(original: string, edited: string): DiffPart[] {
  return normalize(diffChars(original, edited));
}

export function getEnglishDiff(original: string, revised: string): DiffPart[] {
  return normalize(diffWordsWithSpace(original, revised));
}

export function serializeChineseDiff(original: string, edited: string): string {
  return JSON.stringify(
    getChineseDiff(original, edited).map((part) => ({
      type: part.type,
      text: part.value,
    })),
  );
}

export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some((part) => part.type !== "equal");
}
