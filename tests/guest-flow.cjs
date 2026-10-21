const { chromium } = require("playwright");
const { spawn, spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const port = 3012;
const env = {
  ...process.env,
  NEXT_TEST_DIST: ".next-guest-test",
  NEXT_PUBLIC_SUPABASE_URL: "https://pannheu-test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
};
const build = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  { env, encoding: "utf8" },
);
if (build.status !== 0) {
  console.error(build.stdout, build.stderr);
  process.exit(1);
}
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
  { env, stdio: "ignore" },
);
let browser, debugPage;
(async () => {
  for (let n = 0; n < 120; n++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (n === 119) throw Error("Test app failed to start");
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  debugPage = page;
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const token = "a".repeat(48);
  let files = [],
    key,
    uploaded = false,
    deleted = false;
  let failTransfer = false;
  const item = {
    id: "test-id",
    name: "hello.txt",
    size: 5,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    status: "ready",
    share_token: token,
  };
  await context.route("https://pannheu-test.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 200, headers, body: "{}" });
    if (url.pathname === "/test-download") {
      return route.fulfill({
        status: failTransfer ? 503 : 200,
        headers: { ...headers, "Content-Type": "application/octet-stream" },
        body: failTransfer ? "unavailable" : "hello",
      });
    }
    if (url.pathname === "/test-upload") {
      assert.equal(request.method(), "PUT");
      assert.equal(request.postData(), "hello");
      uploaded = true;
      return route.fulfill({ status: 200, headers, body: "{}" });
    }
    if (url.pathname.includes("resolve_share"))
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(
          request.postDataJSON().token === token ? [item] : [],
        ),
      });
    const body = request.postDataJSON();
    if (body.action !== "download") {
      assert.match(body.guest_key, /^[a-f0-9]{64}$/);
    }
    let response;
    switch (body.action) {
      case "list":
        response = {
          files: files.map((file) => ({
            ...file,
            owned: body.guest_key === key,
          })),
          usage: files.length ? 20000000 : 0,
        };
        break;
      case "reserve":
        key = body.guest_key;
        assert.equal(body.size, 5);
        response = {
          id: "test-id",
          upload_url: "https://pannheu-test.supabase.co/test-upload",
        };
        break;
      case "complete":
        assert.equal(body.guest_key, key);
        assert.ok(uploaded);
        files = [item];
        response = { file: item };
        break;
      case "delete":
        if (body.guest_key !== key)
          return route.fulfill({
            status: 404,
            headers,
            body: JSON.stringify({ error: "File not found." }),
          });
        deleted = true;
        files = [];
        response = { ok: true };
        break;
      case "download":
        response = { url: "https://pannheu-test.supabase.co/test-download" };
        break;
      default:
        throw Error(`Unexpected backend action: ${body.action}`);
    }
    return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify(response),
    });
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator(".empty-icon").waitFor();
  await page.locator(".language").click();

  await page
    .getByRole("heading", { name: "Your first share starts here." })
    .waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "One link. All yours to share." })
    .waitFor();
  const link = await page.locator("#share-link").inputValue();
  assert.ok(link.endsWith(`/s/${token}`));
  await page
    .getByRole("button", { name: "Copy sharing link", exact: true })
    .click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link);
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "hello.txt", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "hello.txt", exact: true }).waitFor();
  const ownerBrowserKey = await page.evaluate(() =>
    localStorage.getItem("pannheu-guest-key"),
  );
  await page.evaluate(() =>
    localStorage.setItem("pannheu-guest-key", "b".repeat(64)),
  );
  await page.reload();
  await page.getByRole("heading", { name: "hello.txt", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Delete hello.txt" }).count(),
    0,
    "Public visitors must not see another uploader's delete action",
  );
  await page.evaluate(
    (value) => localStorage.setItem("pannheu-guest-key", value),
    ownerBrowserKey,
  );
  await page.reload();
  await page.getByRole("button", { name: "Delete hello.txt" }).waitFor();
  const before = page.url();
  failTransfer = true;
  await page
    .getByRole("button", { name: "Download hello.txt", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  await page
    .getByRole("button", { name: "Download hello.txt", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const button = document.querySelector(
      'button[aria-label="Download hello.txt"]',
    );
    return button && !button.hasAttribute("disabled");
  });
  failTransfer = false;
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download hello.txt", exact: true })
    .click();
  const saved = await downloadEvent;
  assert.equal(saved.suggestedFilename(), "hello.txt");
  assert.equal(
    require("node:fs").readFileSync(await saved.path(), "utf8"),
    "hello",
  );
  assert.equal(
    page.url(),
    before,
    "Download must not navigate away from the app",
  );
  await page
    .getByRole("button", { name: "Delete hello.txt", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(deleted, false);
  await page
    .getByRole("button", { name: "Delete hello.txt", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("button").last().click();
  await page.locator(".empty-icon").waitFor();
  assert.ok(deleted);
  await page.goto(link);
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).waitFor();
  assert.equal(await page.locator("input[type=email]").count(), 0);
  const sharedDownload = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button").last().click();
  const received = await sharedDownload;
  assert.equal(received.suggestedFilename(), "hello.txt");
  assert.equal(
    require("node:fs").readFileSync(await received.path(), "utf8"),
    "hello",
  );

  await page.goto(`http://127.0.0.1:${port}/?share=${token}`);
  await page.locator(".shared-file").waitFor();
  await page.goto(`http://127.0.0.1:${port}/s/${"b".repeat(48)}`);
  await page.getByRole("dialog").waitFor();
  await page.getByRole("heading", { name: "ឯកសារនេះលែងមានទៀតហើយ" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: guest upload, public cross-browser listing with uploader-only deletion, copy clean URL, direct downloads with original filename and byte verification, failed transfer retry, delete cancel/confirm, new and legacy sharing routes, expired state, no login, no runtime errors.",
  );
})()
  .catch(async (e) => {
    if (debugPage)
      console.log((await debugPage.locator("body").innerText()).slice(-1600));
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.kill("SIGTERM");
    const generated = require("node:fs");
    generated.writeFileSync(
      "next-env.d.ts",
      generated
        .readFileSync("next-env.d.ts", "utf8")
        .replaceAll(".next-guest-test/", ".next/"),
    );
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
    config.include = config.include.filter(
      (path) => !path.includes(".next-guest-test"),
    );
    fs.writeFileSync("tsconfig.json", JSON.stringify(config, null, 2) + "\n");
  });
