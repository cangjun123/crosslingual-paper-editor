import { expect, test } from "@playwright/test";

test("renders populated desktop and narrow layouts without overlap", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        defaultModel: "deepseek-v4-flash",
        baseUrlConfigured: true,
        apiKeyConfigured: true,
      }),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "crosslingual-editor:project:v1",
      JSON.stringify({
        version: 1,
        current: {
          originalEnglish:
            "Although \\method{} improves accuracy by 3.2\\% on $D_{\\mathrm{test}}$ \\cite{smith2024}, these results may not generalize to resource-constrained settings (see Sec.~\\ref{sec:limits}).",
          fullPaperContext:
            "Throughout this paper, we use \\method{} for the proposed method and report all results on $D_{\\mathrm{test}}$.\n\n\\section{Limitations}\\label{sec:limits}",
          originalChinese:
            "尽管 \\method{} 在 $D_{\\mathrm{test}}$ 上将准确率提高了 3.2\\% \\cite{smith2024}，但这些结果可能无法推广到资源受限的设置。",
          editedChinese:
            "尽管 \\method{} 在 $D_{\\mathrm{test}}$ 上将准确率提高了 3.2\\% \\cite{smith2024}，但这些结果仅在资源充足的设置中得到验证，不应推广到资源受限的设置。",
          extraInstruction: "强化适用范围限制，不要改变引用、变量名或 LaTeX 命令。",
          revisedEnglish:
            "Although \\method{} improves accuracy by 3.2\\% on $D_{\\mathrm{test}}$ \\cite{smith2024}, these results do not generalize to resource-constrained settings (see Sec.~\\ref{sec:limits}).",
          model: "deepseek-v4-flash",
        },
        history: [],
      }),
    );
    localStorage.setItem(
      "crosslingual-editor:settings:v1",
      JSON.stringify({ model: "deepseek-v4-flash", temperature: 0.2, stream: true }),
    );
  });
  await page.goto("/");
  await expect(page.getByLabel("原英文段落")).toBeVisible();

  await page.screenshot({ path: "test-results/visual-desktop.png", fullPage: true });
  const desktop = await page.locator(".editor-panel").evaluateAll((panels) =>
    panels.map((panel) => {
      const rect = panel.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  );
  expect(desktop).toHaveLength(3);
  expect(desktop[0]!.right).toBeLessThanOrEqual(desktop[1]!.left + 1);
  expect(desktop[1]!.right).toBeLessThanOrEqual(desktop[2]!.left + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/visual-mobile.png", fullPage: true });
  const narrow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(narrow.content).toBeLessThanOrEqual(narrow.viewport);
  expect(consoleErrors).toEqual([]);
});
