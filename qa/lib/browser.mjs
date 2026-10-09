import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CHROME } from './config.mjs';

export const SHOTS = path.resolve(import.meta.dirname, '../../qa-reports/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

export const VIEWPORTS = {
  desktop: { width: 1366, height: 800 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};

export async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--host-resolver-rules=MAP *.ems.localhost 127.0.0.1'],
  });
}

/** New page that records console errors, page errors and failed/5xx network responses. */
export async function newPage(browser, viewport = VIEWPORTS.desktop, opts = {}) {
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true, ...opts });
  const page = await ctx.newPage();
  const issues = { console: [], pageErrors: [], failed: [], http5xx: [], http4xx: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') issues.console.push(m.text());
  });
  page.on('pageerror', (e) => issues.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => issues.failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 500) issues.http5xx.push(`${r.status()} ${r.url()}`);
    else if (r.status() >= 400) issues.http4xx.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return { page, ctx, issues };
}

export async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/** Ignore noise that is not an application defect (dev-only HMR / favicon / extension errors). */
export const meaningful = (list) =>
  list.filter((s) => !/favicon|hot-update|webpack-hmr|_next\/static\/webpack|Download the React DevTools|ERR_ABORTED/i.test(s));
