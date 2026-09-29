#!/usr/bin/env node
// viewport-check.mjs — screenshot a page at phone and desktop widths (BLUEPRINT step 48).
//
// For each width it loads the URL, waits for the network to settle, saves a full-page
// screenshot, and records console errors, uncaught page errors, failed requests and
// horizontal overflow (content wider than the viewport).
//
// Usage:
//   node tools/viewport-check.mjs <url> <out-dir> [--wait-ms N]
// Writes:
//   <out-dir>/viewport-phone.png, <out-dir>/viewport-desktop.png, <out-dir>/viewport-report.json
// Exit: 0 clean, 1 if any page failed to load or had console errors, page errors or overflow,
//       2 on usage errors or when no browser is available.
//
// Uses the locally installed Chrome (or Edge) through playwright-core, so no browser download is
// needed. Runs outside the product container, so it may use the network.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WIDTHS = [
  { name: "phone", width: 375, height: 812, mobile: true },
  { name: "desktop", width: 1280, height: 800, mobile: false },
];

const [url, outDir, ...rest] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: node tools/viewport-check.mjs <url> <out-dir> [--wait-ms N]");
  process.exit(2);
}
const waitIdx = rest.indexOf("--wait-ms");
const settleMs = waitIdx >= 0 ? Number(rest[waitIdx + 1]) : 1500;

async function launch() {
  for (const channel of ["chrome", "msedge"]) {
    try { return await chromium.launch({ channel, headless: true }); } catch { /* try next */ }
  }
  const envPath = process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return chromium.launch({ executablePath: envPath, headless: true });
  console.error("no browser found: install Chrome or Edge, or set CHROME_PATH");
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });
const browser = await launch();
const report = { url, checkedAt: new Date().toISOString(), views: [] };
let failed = false;

for (const v of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const view = { name: v.name, width: v.width, consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (m) => { if (m.type() === "error") view.consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => view.pageErrors.push(String(e)));
  page.on("requestfailed", (r) => view.failedRequests.push(`${r.method()} ${r.url()} (${r.failure()?.errorText})`));
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    view.status = resp ? resp.status() : null;
    await page.waitForTimeout(settleMs);
    view.overflowPx = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    const shot = join(outDir, `viewport-${v.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    view.screenshot = shot;
  } catch (e) {
    view.loadError = String(e);
  }
  view.ok = !view.loadError && (view.status ?? 0) < 400 && view.consoleErrors.length === 0 &&
    view.pageErrors.length === 0 && view.overflowPx === 0;
  if (!view.ok) failed = true;
  report.views.push(view);
  console.log(`${v.name} ${v.width}px: ${view.ok ? "ok" : "PROBLEMS"}` +
    ` (status ${view.status ?? "-"}, console errors ${view.consoleErrors.length},` +
    ` page errors ${view.pageErrors.length}, overflow ${view.overflowPx ?? "-"}px)`);
  await context.close();
}

await browser.close();
writeFileSync(join(outDir, "viewport-report.json"), JSON.stringify(report, null, 2));
console.log(`report: ${join(outDir, "viewport-report.json")}`);
process.exit(failed ? 1 : 0);
