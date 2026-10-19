const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3000");
  await page
    .getByRole("heading", { name: /ផ្ញើឯកសារ.*ងាយស្រួលជាងមុន/ })
    .waitFor();
  await page.screenshot({ path: "/tmp/pannheu-desktop.png", fullPage: true });
  await page.getByRole("textbox", { name: "Search files" }).fill("Moodboard");
  if ((await page.locator(".file-row").count()) !== 1)
    throw Error("Search failed");
  await page.getByRole("textbox", { name: "Search files" }).fill("");
  await page
    .getByRole("button", { name: "Copy link for Brand guidelines.pdf" })
    .click();
  await page.getByRole("status").filter({ hasText: "Preview file" }).waitFor();

  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.locator(".language").click();
  await page
    .getByRole("heading", { name: /Big ideas.*One simple link/ })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/pannheu-mobile.png", fullPage: true });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile horizontal overflow");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "How it works" })
    .click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("heading", { name: "No account. Just share." })
    .waitFor();
  if (await page.locator('input[type="email"]').count())
    throw Error("Guest flow unexpectedly asks for email");
  await page.keyboard.press("Escape");
  if (await page.getByRole("dialog").count())
    throw Error("Escape did not close help");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "My files" })
    .click();
  if (await page.locator(".upload-card").count())
    throw Error("My files did not simplify the view");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Send a file" })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "Connect Supabase to upload files" })
    .waitFor();
  const context = page.context();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByText("Connect to the internet to upload or download files.")
    .waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: desktop render, search, preview copy, language switch, mobile layout, guest information, upload without login and missing-config error, offline fallback; no runtime errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
