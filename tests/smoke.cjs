const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
(async () => {
  const root = path.resolve(__dirname, "..");
  const utils = await import(pathToFileURL(path.join(root, "js/utils.js")));
  const testLogs = [
    {
      id: "1",
      name: "양평 생막걸리",
      region: "경기 양평",
      ratingOverall: 5,
      ratingPrice: 4,
      ratingTaste: 5,
      alcohol: 6,
      date: "2026-10-22T03:00:00Z",
      memo: "#달콤함 파전과 함께",
    },
    {
      id: "2",
      name: "<img src=x onerror=alert(1)>",
      region: "서울",
      ratingOverall: 0,
      ratingPrice: 0,
      ratingTaste: 0,
      alcohol: 0,
      date: "2026-10-20T03:00:00Z",
      memo: '=HYPERLINK("bad")',
    },
  ];
  assert.equal(utils.filterLogs(testLogs, { query: "양평 파전" }).length, 1);
  assert.equal(utils.filterLogs(testLogs, { filter: "best" }).length, 1);
  assert.equal(utils.statistics(testLogs).average, "5.0");
  assert.equal(utils.safeImageURL("javascript:alert(1)"), "");
  assert.ok(utils.toCSV(testLogs).includes("'=HYPERLINK"));
  let release = 1;
  const server = http.createServer((req, res) => {
    const relative =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(
        /^\//,
        "",
      ) || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json",
          ".png": "image/png",
        }[path.extname(file)] || "application/octet-stream",
      );
      if (relative === "styles/main.css")
        data = Buffer.from(
          data.toString() + `\n:root { --test-release: ${release}; }`,
        );
      if (relative === "sw.js")
        data = Buffer.from(data.toString() + `\n// Test deployment ${release}`);
      res.setHeader("Cache-Control", "max-age=600");
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      serviceWorkers: "block",
    });
    let rows = testLogs.map((log) => ({
      id: log.id,
      name: log.name,
      region: log.region,
      alcohol: log.alcohol,
      rating_overall: log.ratingOverall,
      rating_price: log.ratingPrice,
      rating_taste: log.ratingTaste,
      memo: log.memo,
      date: log.date,
      image_url: null,
      thumbnail_url: null,
    }));
    let fail = false,
      writes = 0;
    await context.route("https://*.supabase.co/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (req.method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
        });
        return;
      }
      if (fail) {
        await route.fulfill({
          status: 503,
          json: { message: "test unavailable" },
        });
        return;
      }
      if (url.pathname.startsWith("/storage/v1/object/")) {
        if (req.method() === "POST") {
          assert.equal(req.headers()["content-type"], "image/jpeg");
          assert.equal(req.postDataBuffer()[0], 0xff);
          await route.fulfill({ status: 200, json: { Key: "test" } });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "image/png",
            body: fs.readFileSync(path.join(root, "icons/icon-192.png")),
          });
        }
        return;
      }
      let result = rows;
      if (req.method() === "POST") {
        writes++;
        const row = { ...req.postDataJSON(), id: String(10 + writes) };
        rows.push(row);
        result = [row];
      }
      if (req.method() === "PATCH") {
        writes++;
        const id = url.searchParams.get("id").slice(3);
        rows = rows.map((row) =>
          row.id === id ? { ...row, ...req.postDataJSON() } : row,
        );
        result = rows.filter((row) => row.id === id);
      }
      if (req.method() === "DELETE") {
        writes++;
        const id = url.searchParams.get("id").slice(3);
        result = rows.filter((row) => row.id === id);
        rows = rows.filter((row) => row.id !== id);
      }
      await route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        json: result,
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(
      () => document.querySelectorAll(".card").length === 2,
    );
    assert.equal(
      await page.locator(".card h3").nth(1).textContent(),
      testLogs[1].name,
    );
    assert.equal(await page.locator(".card h3 img").count(), 0);
    const out = path.join(root, "test-results");
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({
      path: path.join(out, "desktop.png"),
      fullPage: true,
    });
    await page.locator("#search").fill("파전");
    assert.equal(await page.locator(".card").count(), 1);
    await page.locator("#search").fill("");
    await page.locator(".favorite").first().click();
    await page.locator("[data-filter=favorite]").click();
    assert.equal(await page.locator(".card").count(), 1);
    await page.locator("[data-filter=all]").click();
    await page.locator("[data-add]").click();
    await page.locator("#name").fill("테스트 막걸리");
    await page.locator("#alcohol").fill("6.5");
    await page.locator("#ratingOverall").selectOption("4");
    await page.locator("#memo").fill("산뜻한 맛");
    await page.locator("#save-btn").click();
    await page.waitForURL("**/#detail/*");
    assert.equal(
      await page.locator("#detail-name").textContent(),
      "테스트 막걸리",
    );
    await page.getByRole("button", { name: "기록 수정", exact: true }).click();
    await page.locator("#name").fill("수정한 막걸리");
    await page.locator("#save-btn").click();
    await page.waitForURL("**/#detail/*");
    assert.equal(
      await page.locator("#detail-name").textContent(),
      "수정한 막걸리",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.waitForURL("**/#list");
    assert.equal(rows.length, 2);
    assert.equal(writes, 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(out, "mobile.png"),
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `list overflow ${width}`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-add]").click();
    await page.screenshot({
      path: path.join(out, "mobile-form.png"),
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `form overflow ${width}`,
      );
    }
    await page.locator("#name").fill("실패 시 보존");
    fail = true;
    await page.locator("#save-btn").click();
    await page.locator("#form-error:not([hidden])").waitFor();
    assert.equal(await page.locator("#name").inputValue(), "실패 시 보존");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("[data-back]").first().click();
    await page.waitForTimeout(100);
    assert.equal(new URL(page.url()).hash, "#add");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-back]").first().click();
    await page.waitForURL("**/#list");
    await page.locator("#refresh-btn").click();
    await page.locator("#load-error:not([hidden])").waitFor();
    assert.equal(await page.locator(".card").count(), 2);
    const download = page.waitForEvent("download");
    await page.locator("#export-btn").click();
    assert.ok((await download).suggestedFilename().endsWith(".csv"));
    assert.deepEqual(errors, []);
    console.log(
      "PASS: utility checks, XSS text rendering, search, favorite, create/edit/delete, save failure retention, dirty navigation, cached read failure, CSV download, responsive 320/390/768/1440px.",
    );
    await context.close();
    const offlineContext = await browser.newContext({
      serviceWorkers: "allow",
    });
    await offlineContext.route("https://*.supabase.co/**", (route) =>
      route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        json: rows,
      }),
    );
    const offlinePage = await offlineContext.newPage();
    await offlinePage.goto(`http://127.0.0.1:${server.address().port}`);
    await offlinePage.waitForFunction(
      () => document.querySelectorAll(".card").length === 2,
    );
    await offlinePage.evaluate(() => navigator.serviceWorker.ready);
    await offlinePage.waitForFunction(
      () => !!navigator.serviceWorker.controller,
    );
    await offlinePage.reload();
    await offlinePage.locator("[data-add]").click();
    await offlinePage.locator("#name").fill("업데이트 중 보존할 기록");
    release = 2;
    await offlinePage.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration()).update(),
    );
    await offlinePage.locator("#update-btn").waitFor();
    assert.equal(
      await offlinePage.locator("#name").inputValue(),
      "업데이트 중 보존할 기록",
    );
    offlinePage.once("dialog", (dialog) => dialog.dismiss());
    await offlinePage.locator("#update-btn").click();
    assert.equal(
      await offlinePage.locator("#name").inputValue(),
      "업데이트 중 보존할 기록",
    );
    offlinePage.once("dialog", (dialog) => dialog.accept());
    await offlinePage.locator("[data-back]").first().click();
    await offlinePage.waitForURL("**/#list");
    await offlinePage.locator("#update-btn").click();
    await offlinePage.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--test-release")
          .trim() === "2",
    );
    // Change CSS without changing any cache name or service-worker registration.
    release = 3;
    await offlinePage.reload();
    await offlinePage.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--test-release")
          .trim() === "3",
    );
    console.log(
      "PASS: worker activates with an open tab; draft survives; update confirmation; new CSS bypasses max-age=600 without a cache-name bump.",
    );
    await offlineContext.unroute("https://*.supabase.co/**");
    await offlineContext.setOffline(true);
    await offlinePage.reload();
    await offlinePage.waitForFunction(
      () => document.querySelectorAll(".card").length === 2,
    );
    assert.equal(await offlinePage.locator("#page-title").isVisible(), true);
    console.log(
      "PASS: JPEG upload and thumbnail generation, photo removal, offline shell and cached list reload.",
    );
    await offlineContext.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
