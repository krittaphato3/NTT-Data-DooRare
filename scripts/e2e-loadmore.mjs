#!/usr/bin/env node
/**
 * E2E: Load more must not resize cards.
 *
 * For every paged card (near-expiry, alerts, request-status), at each viewport:
 *   1. measure the card and its row peers' heights,
 *   2. click "โหลดเพิ่มเติม" (Load more),
 *   3. assert the card height is unchanged (≤1px) — it must scroll instead,
 *   4. assert the list body actually became scrollable,
 *   5. click "แสดงน้อยลง" (Show less) and assert the height is restored.
 *
 * The request-status card also reports each request block's height before/after
 * as info (rows reflow to natural size when the list densifies after expand).
 *
 * Usage:
 *   node scripts/e2e-loadmore.mjs [--url http://localhost:4173] [--channel msedge]
 *
 * The browser is the system Edge/Chrome (playwright-core does not download one).
 */
import { chromium } from 'playwright-core';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg('url', 'http://localhost:4173');
const forcedChannel = arg('channel', '');
const forcedExecutable = arg('executable', '');
const TOL = 1; // px — heights are Math.round'ed when frozen, allow ≤1px drift

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 1024, h: 768 },
  { w: 390, h: 844 },
];

const TARGETS = [
  { part: 'near-expiry', label: 'Near-expiry', body: '.card-scroll' },
  { part: 'alerts', label: 'Alerts', body: '.equal-scroll' },
  { part: 'request-status', label: 'Request Status', body: '.equal-scroll' },
];

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
  throw new Error(`Could not launch a browser (${lastError?.message?.split('\n')[0] ?? 'unknown'})`);
}

const r1 = (n) => Math.round(n * 10) / 10;

async function runTarget(page, t) {
  const card = page.locator(`[data-part="${t.part}"]`);
  if ((await card.count()) === 0) return { label: t.label, verdict: 'FAIL (card not found)', failed: 1 };

  const cardH = () => card.evaluate((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
  const peerH = () =>
    card.evaluate((el) =>
      [...el.parentElement.children].map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10),
    );
  // Request blocks (info): wrapper children that carry a bottom rule.
  const blocks = () =>
    card.evaluate((el) => {
      const wrap = el.querySelector('.equal-scroll, .card-scroll');
      if (!wrap) return [];
      return [...wrap.children]
        .filter((c) => c.tagName === 'DIV' && c.style.borderBottom)
        .slice(0, 4)
        .map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10);
    });

  const before = r1(await cardH());
  const peersBefore = await peerH();
  const blocksBefore = await blocks();

  const moreBtn = card.locator('button:has-text("โหลดเพิ่มเติม")');
  if ((await moreBtn.count()) === 0)
    return { label: t.label, before, verdict: 'FAIL (no Load more button)', failed: 1 };
  await moreBtn.click();
  await page.waitForTimeout(250);

  const after = r1(await cardH());
  const peersAfter = await peerH();
  const blocksAfter = await blocks();
  const scroll = await card.evaluate((el, bodySel) => {
    const body = el.querySelector(bodySel) ?? el.querySelector('.equal-scroll, .card-scroll');
    if (!body) return null;
    return { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollable: body.scrollHeight > body.clientHeight + 1 };
  }, t.body);

  const delta = r1(after - before);
  const maxPeerDelta = Math.max(...peersBefore.map((h, i) => Math.abs(r1(peersAfter[i] - h))));
  const sizeOk = Math.abs(delta) <= TOL;
  const peersOk = maxPeerDelta <= TOL;
  const scrollOk = !!scroll?.scrollable;

  const lessBtn = card.locator('button:has-text("แสดงน้อยลง")');
  await lessBtn.click();
  await page.waitForTimeout(250);
  const restored = r1(await cardH());
  const restoreOk = Math.abs(restored - before) <= TOL;

  const pass = sizeOk && peersOk && scrollOk && restoreOk;
  return {
    label: t.label,
    before,
    after,
    delta,
    peers: maxPeerDelta,
    scroll: scroll ? `${scroll.scrollHeight}>${scroll.clientHeight}` : 'n/a',
    restored,
    blocks: blocksBefore.length ? `${JSON.stringify(blocksBefore)} → ${JSON.stringify(blocksAfter)}` : '',
    verdict: pass
      ? 'PASS'
      : `FAIL (${[!sizeOk && `size Δ${delta}`, !peersOk && `peer Δ${maxPeerDelta}`, !scrollOk && 'not scrollable', !restoreOk && `restore Δ${r1(restored - before)}`].filter(Boolean).join(', ')})`,
    failed: pass ? 0 : 1,
  };
}

async function main() {
  const browser = await launchBrowser();
  const all = [];
  let failed = 0;

  for (const v of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: v.w, height: v.h },
      deviceScaleFactor: 1,
      locale: 'th-TH',
      timezoneId: 'Asia/Bangkok',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('[data-part="kpi-row"]', { timeout: 15000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(300);

    for (const t of TARGETS) {
      const row = await runTarget(page, t);
      all.push({ vp: `${v.w}×${v.h}`, ...row });
      failed += row.failed;
    }
    await context.close();
  }

  await browser.close();

  console.log(`\nE2E · Load more must not resize cards — ${url}\n`);
  const w = (s, n) => String(s).padEnd(n);
  console.log(
    `${w('viewport', 11)}${w('card', 16)}${w('before', 8)}${w('after', 8)}${w('Δ', 6)}${w('peerΔ', 7)}${w('scroll(h>c)', 13)}${w('restored', 10)}verdict`,
  );
  for (const r of all) {
    console.log(
      `${w(r.vp, 11)}${w(r.label, 16)}${w(r.before ?? '-', 8)}${w(r.after ?? '-', 8)}${w(r.delta ?? '-', 6)}${w(r.peers ?? '-', 7)}${w(r.scroll ?? '-', 13)}${w(r.restored ?? '-', 10)}${r.verdict}`,
    );
    if (r.blocks) console.log(`${w('', 11)}${w('', 16)}request blocks px: ${r.blocks}`);
  }
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nE2E failed: ${error.message}`);
  process.exit(1);
});
