// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reviseRequestSchema, translateRequestSchema } from "../shared/contracts.js";
import { buildRevisionMessages, buildTranslationMessages } from "./prompts.js";

describe("prompt builders", () => {
  it("preserves academic and LaTeX translation constraints", () => {
    const input = translateRequestSchema.parse({
      originalEnglish: "We observe $x > 0$ in Fig.~\\ref{fig:result} \\cite{smith2024}.",
      model: "test-model",
      temperature: 0.2,
      stream: true,
    });

    const messages = buildTranslationMessages(input);

    expect(messages[0].content).toContain("hedging");
    expect(messages[1].content).toContain("$x > 0$");
    expect(messages[1].content).toContain("\\ref{fig:result}");
    expect(messages[1].content).toContain("Output Chinese only");
  });

  it("instructs revision from semantic deltas rather than retranslating", () => {
    const input = reviseRequestSchema.parse({
      originalEnglish: "The method applies to all settings.",
      originalChinese: "该方法适用于所有设置。",
      editedChinese: "该方法仅适用于部分设置。",
      chineseDiff: '[{"type":"remove","text":"所有"},{"type":"add","text":"部分"}]',
      extraInstruction: "Weaken the claim.",
      fullPaperContext: "We call the method \\method{} throughout.",
      model: "test-model",
      temperature: 0.2,
      stream: true,
    });

    const messages = buildRevisionMessages(input);
    const combined = messages.map((message) => message.content).join("\n");

    expect(combined).toContain("Do not translate the edited Chinese from scratch");
    expect(combined).toContain("smallest necessary changes");
    expect(combined).toContain("Weaken the claim.");
    expect(combined).toContain("\\method{}");
    expect(combined).toContain(input.chineseDiff);
  });
});
