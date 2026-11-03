import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiMocks = vi.hoisted(() => ({
  fetchConfig: vi.fn(),
  translateToChinese: vi.fn(),
  reviseEnglish: vi.fn(),
  testLlm: vi.fn(),
  listModels: vi.fn(),
}));

vi.mock("./lib/api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  ...apiMocks,
}));

import App from "./App";
import { SETTINGS_STORAGE_KEY } from "./lib/storage";

describe("editor workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    apiMocks.fetchConfig.mockResolvedValue({
      defaultModel: "test-model",
      provider: "openai",
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
    fireEvent.change(original, { target: { value: "  The method applies to all settings.\r\n" } });
    await user.click(screen.getByRole("button", { name: "生成中文译文" }));

    const editedChinese = await screen.findByLabelText("编辑后的中文");
    await waitFor(() => expect(editedChinese).toHaveValue("该方法适用于所有场景。"));
    await user.clear(editedChinese);
    await user.type(editedChinese, "该方法仅适用于部分场景。");
    const revisionButton = screen.getByRole("button", { name: "根据中文回写英文" });
    expect(revisionButton).toBeEnabled();
    await user.click(revisionButton);

    expect(apiMocks.translateToChinese.mock.calls[0]?.[0].originalEnglish).toBe(
      "The method applies to all settings.",
    );

    const revised = screen.getByLabelText("修改后的英文");
    await waitFor(() => expect(revised).toHaveValue("The method applies only to limited settings."));
    expect(screen.getByLabelText("英文修改对比")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存版本" }));
    await user.click(screen.getByRole("button", { name: "历史版本" }));
    expect(await screen.findByText("1 条已保存记录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复" })).toBeInTheDocument();
  });

  it("preserves Chinese edits when restoring the English translation source", async () => {
    const user = userEvent.setup();
    render(<App />);

    const original = await screen.findByLabelText("原英文段落");
    fireEvent.change(original, { target: { value: "Original English." } });
    await user.click(screen.getByRole("button", { name: "生成中文译文" }));

    const editedChinese = await screen.findByLabelText("编辑后的中文");
    await waitFor(() => expect(editedChinese).toHaveValue("该方法适用于所有场景。"));
    fireEvent.change(editedChinese, { target: { value: "用户已经修改的中文。" } });
    fireEvent.change(original, { target: { value: "Changed English." } });

    expect(screen.getByText("原英文已变更")).toBeInTheDocument();
    const revisionButton = screen.getByRole("button", { name: "根据中文回写英文" });
    expect(revisionButton).toBeEnabled();
    await user.click(revisionButton);

    expect(screen.getByRole("alertdialog")).toHaveTextContent("当前中文修改仍然保留");
    await user.click(screen.getByRole("button", { name: "恢复翻译时英文" }));

    expect(original).toHaveValue("Original English.");
    expect(editedChinese).toHaveValue("用户已经修改的中文。");
    expect(screen.queryByText("原英文已变更")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "历史版本" }));
    expect(await screen.findByText("自动备份")).toBeInTheDocument();
  });

  it("backs up Chinese edits before retranslating changed English", async () => {
    const user = userEvent.setup();
    render(<App />);

    const original = await screen.findByLabelText("原英文段落");
    fireEvent.change(original, { target: { value: "Original English." } });
    await user.click(screen.getByRole("button", { name: "生成中文译文" }));

    const editedChinese = await screen.findByLabelText("编辑后的中文");
    await waitFor(() => expect(editedChinese).toHaveValue("该方法适用于所有场景。"));
    fireEvent.change(editedChinese, { target: { value: "需要保留的中文修改。" } });
    fireEvent.change(original, { target: { value: "Changed English." } });
    await user.click(screen.getByRole("button", { name: "根据中文回写英文" }));
    await user.click(screen.getByRole("button", { name: "备份并重新翻译" }));

    await waitFor(() => expect(apiMocks.translateToChinese).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(editedChinese).toHaveValue("该方法适用于所有场景。"));
    expect(screen.queryByText("原英文已变更")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "历史版本" }));
    expect(await screen.findByText("自动备份")).toBeInTheDocument();
  });

  it("stores the browser connection and sends it with every request", async () => {
    apiMocks.fetchConfig.mockResolvedValue({
      defaultModel: "test-model",
      provider: "openai",
      baseUrlConfigured: false,
      apiKeyConfigured: false,
    });
    apiMocks.listModels.mockResolvedValue(["gemini-pro", "gemini-flash"]);
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    expect(await screen.findByText(/尚未配置模型服务/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("radio", { name: "Gemini" }));
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "https://relay.test/gemini" } });
    expect(screen.getByText("https://relay.test/gemini/v1beta")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "secret-key" } });
    fireEvent.change(screen.getByLabelText("模型", { selector: "#settings-model" }), {
      target: { value: "gemini-pro" },
    });
    await user.click(screen.getByRole("button", { name: /获取列表/ }));
    expect(await screen.findByText("已获取 2 个模型。")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/尚未配置模型服务/)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}")).toMatchObject({
        provider: "gemini",
        baseUrl: "https://relay.test/gemini",
        apiKey: "secret-key",
        model: "gemini-pro",
      }),
    );
    unmount();

    render(<App />);
    const original = await screen.findByLabelText("原英文段落");
    expect(screen.getByRole("button", { name: /Gemini · relay.test/ })).toBeInTheDocument();
    fireEvent.change(original, { target: { value: "Original English." } });
    fireEvent.keyDown(original, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(apiMocks.translateToChinese).toHaveBeenCalledOnce());
    expect(apiMocks.translateToChinese.mock.calls[0]?.[0]).toMatchObject({
      model: "gemini-pro",
      connection: { provider: "gemini", baseUrl: "https://relay.test/gemini", apiKey: "secret-key" },
    });
  });
});
