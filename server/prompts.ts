import type { ParsedReviseRequest, ParsedTranslateRequest } from "../shared/contracts.js";

export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export function buildTranslationMessages(input: ParsedTranslateRequest): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an expert academic translator. Translate English academic writing into faithful, clear Chinese. Preserve the original meaning, logical structure, technical terms, hedging, and nuance. Do not add explanations, comments, or summaries.",
    },
    {
      role: "user",
      content: `Translate the following English academic paragraph into faithful Chinese.

Requirements:
- Preserve all technical meaning.
- Preserve hedging and uncertainty.
- Preserve citation markers, LaTeX commands, math expressions, variable names, and proper nouns.
- Do not add information.
- Do not omit information.
- Output Chinese only.

English paragraph:
<english_paragraph>
${input.originalEnglish}
</english_paragraph>`,
    },
  ];
}

export function buildRevisionMessages(input: ParsedReviseRequest): ChatMessage[] {
  const extraInstruction = input.extraInstruction?.trim() || "Not provided.";
  const fullPaperContext = input.fullPaperContext?.trim() || "Not provided.";

  return [
    {
      role: "system",
      content:
        "You are an expert academic writing assistant. Revise an English academic paragraph by detecting the semantic changes between the faithful Chinese translation and the user-edited Chinese, then apply only those changes to the original English. Do not translate the edited Chinese from scratch. Preserve the original English style and academic tone.",
    },
    {
      role: "user",
      content: `Revise the original English paragraph according to the user's Chinese edits.

Original English paragraph:
<original_english>
${input.originalEnglish}
</original_english>

Faithful Chinese translation of the original paragraph:
<original_chinese>
${input.originalChinese}
</original_chinese>

User-edited Chinese version:
<edited_chinese>
${input.editedChinese}
</edited_chinese>

Chinese diff between the original Chinese and the edited Chinese (JSON):
<chinese_diff>
${input.chineseDiff}
</chinese_diff>

Additional user instruction:
<additional_instruction>
${extraInstruction}
</additional_instruction>

Optional full-paper context, possibly in LaTeX:
<full_paper_context>
${fullPaperContext}
</full_paper_context>

Requirements:
1. Detect the semantic changes from the original Chinese to the edited Chinese, then apply those changes to the original English. Do not retranslate the edited Chinese from scratch.
2. Also apply the additional user instruction if it is provided.
3. Preserve the style, tone, terminology, and sentence rhythm of the original English paragraph as much as possible.
4. If full-paper context is provided, keep terminology, notation, LaTeX commands, citation style, and academic tone consistent with that context.
5. Make the smallest necessary changes unless the original English contains clear grammar problems, awkward academic phrasing, or ambiguity.
6. Do not introduce claims, limitations, results, or implications that are not supported by the edited Chinese or the additional instruction.
7. Preserve LaTeX commands, citations, references, math expressions, labels, and variable names unless the user's edit clearly requires changing them.
8. Output only the revised English paragraph. Do not include explanations, bullet points, markdown fences, or revision notes.

Revised English paragraph:`,
    },
  ];
}
