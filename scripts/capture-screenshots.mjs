#!/usr/bin/env node
/**
 * Capture review screenshots of the dashboard — full pages and each UI part —
 * into artifacts/, and rebuild artifacts/index.html (a gallery for quick review).
 *
 * Usage:
 *   npm run capture        # against http://localhost:8080 (Docker build)
 *   npm run capture:dev    # against http://127.0.0.1:5173 (Vite dev server)
 *   node scripts/capture-screenshots.mjs --url <url> --out <dir> --channel msedge
 *
 * Parts are located with the stable `data-part` attributes on the components.
 * The browser is the system Edge/Chrome (playwright-core does not download one);
 * override with --channel <name> or --executable <path>.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg('url', 'http://localhost:8080');
const outDir = resolve(ROOT, arg('out', 'artifacts'));
const shotsDir = join(outDir, 'screenshots');
const forcedChannel = arg('channel', '');
const forcedExecutable = arg('executable', '');

const DEVICES = [
  { name: 'desktop-1440x900', width: 1440, height: 900, parts: true },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-1024x768', width: 1024, height: 768, parts: true },
  { name: 'tablet-portrait-768x1024', width: 768, height: 1024 },
  { name: 'phone-390x844', width: 390, height: 844, parts: true, drawer: true },
  { name: 'phone-small-360x800', width: 360, height: 800 },
];

const PARTS = [
  { name: 'topbar', selector: '[data-part="topbar"]' },
  { name: 'sidebar', selector: '[data-part="sidebar"]' },
  { name: 'page-header', selector: '[data-part="page-header"]' },
  { name: 'kpi-row', selector: '[data-part="kpi-row"]' },
  { name: 'alerts-panel', selector: '[data-part="alerts"]' },
  { name: 'agent-suggestion', selector: '[data-part="agent-suggestion"]' },
  { name: 'request-status-panel', selector: '[data-part="request-status"]' },
  { name: 'nearby-hospitals', selector: '[data-part="nearby-hospitals"]' },
  { name: 'work-history', selector: '[data-part="work-history"]' },
  { name: 'near-expiry', selector: '[data-part="near-expiry"]' },
  { name: 'recent-activity', selector: '[data-part="recent-activity"]' },
  { name: 'footer', selector: '[data-part="footer"]' },
];

/* Part shots should show a widget in full, not clipped by the sticky top bar
   or the panels' inner scroll boxes. The sidebar keeps its real position and
   size: expanding it in-flow would squeeze the page at phone widths. */
const PART_OVERRIDES = `
  .topbar { position: static !important; }
  .equal-scroll { max-height: none !important; overflow: visible !important; }
`;

function pngSize(buffer) {
  // PNG IHDR: width/height are big-endian uint32 at byte offsets 16 and 20
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function launchBrowser() {
  const attempts = forcedExecutable
    ? [{ executablePath: forcedExecutable }]
    : forcedChannel
      ? [{ channel: forcedChannel }]
      : [{ channel: 'msedge' }, { channel: 'chrome' }];
  let lastError = null;
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Could not launch a browser (${lastError?.message?.split('\n')[0] ?? 'unknown error'}).\n` +
      'Install Microsoft Edge / Google Chrome, or pass --channel <name> / --executable <path>.',
  );
}

function renderGallery(manifest) {
  const sections = manifest.devices
    .map(
      (device) => `
      <section class="device">
        <h2>${device.name} <span>${device.width}×${device.height}</span></h2>
        <div class="grid">
          ${device.files
            .map(
              (file) => `<figure>
            <a href="screenshots/${device.name}/${file.file}" target="_blank" rel="noopener">
              <img src="screenshots/${device.name}/${file.file}" alt="${device.name} · ${file.file}" loading="lazy">
            </a>
            <figcaption>${file.file.replace('.png', '')} · ${file.width}×${file.height}</figcaption>
          </figure>`,
            )
            .join('\n')}
        </div>
      </section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MedSupply Link — UI artifacts</title>
<style>
  :root { --ink:#0f2a5c; --body:#475569; --border:#e2e8f0; --bg:#f5f8fc; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--body);
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif; }
  header { margin-bottom:24px; }
  h1 { margin:0 0 6px; font-size:22px; color:var(--ink); }
  header p { margin:2px 0; font-size:13px; }
  code { background:#fff; border:1px solid var(--border); border-radius:4px; padding:1px 5px; }
  .device { margin:0 0 28px; }
  .device h2 { font-size:15px; color:var(--ink); margin:0 0 12px; display:flex; align-items:baseline; gap:8px; }
  .device h2 span { font-size:12px; font-weight:400; color:#94a3b8; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
  figure { margin:0; background:#fff; border:1px solid var(--border); border-radius:10px;
           padding:10px; box-shadow:0 1px 2px rgba(15,42,92,.04); }
  figure a { display:block; overflow:auto; max-height:420px; border-radius:6px; background:#fafcff; }
  figure img { display:block; width:100%; height:auto; }
  figcaption { margin-top:8px; font-size:12px; color:#64748b; }
</style>
</head>
<body>
<header>
  <h1>MedSupply Link — dashboard UI artifacts</h1>
  <p>Captured ${manifest.generatedAt} from <code>${manifest.url}</code>.</p>
  <p>Regenerate with <code>npm run capture</code> (Docker) or <code>npm run capture:dev</code> (Vite dev server).</p>
</header>
${sections}
</body>
</html>`;
}

async function main() {
  await rm(shotsDir, { recursive: true, force: true });
  await mkdir(shotsDir, { recursive: true });

  const browser = await launchBrowser();
  const manifest = { url, generatedAt: new Date().toISOString(), devices: [] };

  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 1,
      locale: 'th-TH',
      timezoneId: 'Asia/Bangkok',
    });
    const page = await context.newPage();
    const dir = join(shotsDir, device.name);
    await mkdir(dir, { recursive: true });
    const files = [];

    const shot = async (name, target, options = {}) => {
      const buffer = await target.screenshot({ animations: 'disabled', ...options });
      const { width, height } = pngSize(buffer);
      const file = `${name}.png`;
      await writeFile(join(dir, file), buffer);
      files.push({ file, width, height, bytes: buffer.length });
      console.log(`  ${device.name}/${file}  ${width}×${height}  ${Math.round(buffer.length / 1024)} KB`);
    };

    console.log(`\n${device.name}:`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('[data-part="kpi-row"]', { timeout: 15000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(400);
    await shot('full-page', page, { fullPage: true });

    if (device.parts) {
      await page.addStyleTag({ content: PART_OVERRIDES });
      for (const part of PARTS) {
        if (part.name === 'sidebar' && device.drawer) continue; // captured as drawer-open instead
        const locator = page.locator(part.selector).first();
        if ((await locator.count()) === 0) {
          console.log(`  (skip ${part.name}: not found)`);
          continue;
        }
        await shot(part.name, locator);
      }
    }

    if (device.drawer) {
      await page.click('.nav-toggle');
      await page.waitForTimeout(350);
      await shot('drawer-open', page.locator('.side'));
      await page.keyboard.press('Escape');
    }

    manifest.devices.push({ name: device.name, width: device.width, height: device.height, files });
    await context.close();
  }

  await browser.close();
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outDir, 'index.html'), renderGallery(manifest));

  const total = manifest.devices.reduce((n, d) => n + d.files.length, 0);
  console.log(`\nCaptured ${total} images → ${shotsDir}`);
  console.log(`Gallery → ${join(outDir, 'index.html')}`);
}

main().catch((error) => {
  console.error(`\nCapture failed: ${error.message}`);
  process.exit(1);
});
