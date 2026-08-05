import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("completes the cross-lingual editing workflow", async ({ page }) => {
  await page.getByLabel("原英文段落").fill("  The method applies to all settings \\cite{smith2024}.\n");
  await page.getByRole("button", { name: "生成中文译文" }).click();
  await expect(page.getByLabel("编辑后的中文")).toHaveValue("该方法适用于所有设置 \\cite{smith2024}。");

  await page.getByLabel("编辑后的中文").fill("该方法仅适用于有限设置 \\cite{smith2024}。");
  await page.getByLabel("额外修改要求").fill("弱化适用范围，不要改变引用。 ");
  await expect(page.getByRole("button", { name: "根据中文回写英文" })).toBeEnabled();
  await page.getByRole("button", { name: "根据中文回写英文" }).click();

  await expect(page.getByLabel("修改后的英文")).toHaveValue(
    "The method applies only to limited settings \\cite{smith2024}.",
  );
  const additions = page.getByLabel("英文修改对比").locator("ins");
  await expect(additions).toHaveCount(2);
  expect(await additions.allTextContents()).toEqual(["only ", "limited"]);

  await page.getByRole("button", { name: "保存版本" }).click();
  await page.getByRole("button", { name: "历史版本" }).click();
  await expect(page.getByText("1 条已保存记录")).toBeVisible();
});

test("keeps the narrow layout within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel("原英文段落")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("recovers the translation source without losing Chinese edits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("原英文段落").fill("Original English.");
  await page.getByRole("button", { name: "生成中文译文" }).click();
  await page.getByLabel("编辑后的中文").fill("用户已经修改的中文。 ");
  await page.getByLabel("原英文段落").fill("Changed English.");

  await expect(page.getByText("原英文已变更")).toBeVisible();
  const revisionButton = page.getByRole("button", { name: "根据中文回写英文" });
  await expect(revisionButton).toBeEnabled();
  await revisionButton.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("当前中文修改仍然保留");
  await expect(dialog.getByRole("button", { name: "恢复翻译时英文" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "备份并重新翻译" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);

  await dialog.getByRole("button", { name: "恢复翻译时英文" }).click();
  await expect(page.getByLabel("原英文段落")).toHaveValue("Original English.");
  await expect(page.getByLabel("编辑后的中文")).toHaveValue("用户已经修改的中文。 ");
  await expect(page.getByText("原英文已变更")).toHaveCount(0);

  await page.getByRole("button", { name: "历史版本" }).click();
  await expect(page.getByText("自动备份", { exact: true })).toBeVisible();
});

async function mockApi(page: Page) {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        defaultModel: "test-model",
        baseUrlConfigured: true,
        apiKeyConfigured: true,
      }),
    }),
  );
  await page.route("**/api/translate-to-chinese", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'event: delta\ndata: {"text":"该方法适用于所有设置 \\\\cite{smith2024}。"}\n\n',
        'event: done\ndata: {"text":"该方法适用于所有设置 \\\\cite{smith2024}。"}\n\n',
      ].join(""),
    }),
  );
  await page.route("**/api/revise-english", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'event: delta\ndata: {"text":"The method applies only to limited settings \\\\cite{smith2024}."}\n\n',
        'event: done\ndata: {"text":"The method applies only to limited settings \\\\cite{smith2024}."}\n\n',
      ].join(""),
    }),
  );
}
