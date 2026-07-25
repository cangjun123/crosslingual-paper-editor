import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiMocks = vi.hoisted(() => ({
  fetchConfig: vi.fn(),
  translateToChinese: vi.fn(),
  reviseEnglish: vi.fn(),
  testLlm: vi.fn(),
}));

vi.mock("./lib/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  ...apiMocks,
}));

import App from "./App";

describe("editor workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    apiMocks.fetchConfig.mockResolvedValue({
      defaultModel: "test-model",
      baseUrlConfigured: true,
      apiKeyConfigured: true,
    });
    apiMocks.translateToChinese.mockImplementation(async (_request, onDelta) => {
      onDelta("该方法适用于所有场景。");
      return "该方法适用于所有场景。";
    });
    apiMocks.reviseEnglish.mockImplementation(async (_request, onDelta) => {
      onDelta("The method applies only to limited settings.");
      return "The method applies only to limited settings.";
    });
  });

  it("translates, edits, revises, diffs, and saves a version", async () => {
    const user = userEvent.setup();
    render(<App />);

    const original = await screen.findByLabelText("原英文段落");
    await user.type(original, "The method applies to all settings.");
    await user.click(screen.getByRole("button", { name: "生成中文译文" }));

    const editedChinese = await screen.findByLabelText("编辑后的中文");
    await waitFor(() => expect(editedChinese).toHaveValue("该方法适用于所有场景。"));
    await user.clear(editedChinese);
    await user.type(editedChinese, "该方法仅适用于部分场景。");
    await user.click(screen.getByRole("button", { name: "根据中文回写英文" }));

    const revised = screen.getByLabelText("修改后的英文");
    await waitFor(() => expect(revised).toHaveValue("The method applies only to limited settings."));
    expect(screen.getByLabelText("英文修改对比")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存版本" }));
    await user.click(screen.getByRole("button", { name: "历史版本" }));
    expect(await screen.findByText("1 条已保存记录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复" })).toBeInTheDocument();
  });
});
