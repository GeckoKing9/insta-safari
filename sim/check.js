#!/usr/bin/env node
// Frozen checker: drives instagram-focus.user.js through real-use scenarios in a mobile headless Chromium
// against the fixture served by server.py. Prints "FAIL <id>: reason" per failure; exit 0 only when none.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'instagram-focus.user.js'), 'utf8');
const fails = [];
const fail = (id, why) => fails.push(`FAIL ${id}: ${why}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser, { script = true, storage = {} } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro Max'], locale: 'en-CA' });
  await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  if (script) await ctx.addInitScript(SCRIPT);
  const page = await ctx.newPage();
  return { ctx, page };
}

async function swipeUp(page, x, y) {
  const cdp = await page.context().newCDPSession(page);
  const tp = (yy) => [{ x, y: yy, radiusX: 2, radiusY: 2, force: 1, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(y) });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(y - i * 25) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

// checkVisibility() also covers position:fixed elements, whose offsetParent is always null
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
const visibleCount = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.checkVisibility()).length, sel);

async function serverUp() { try { const r = await fetch(BASE + '/'); return r.ok; } catch { return false; } }

async function main() {
  if (await serverUp()) { console.log(`FAIL harness: something already listens on ${BASE} (a stale fixture server?)`); process.exit(2); }
  const server = spawn('python3', [path.join(__dirname, 'server.py'), String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] });
  let serverErr = ''; server.stderr.on('data', (d) => { serverErr += d; });
  for (let i = 0; i < 30 && !(await serverUp()); i++) await sleep(100);
  if (!(await serverUp())) { console.log('FAIL harness: fixture server did not start: ' + serverErr.slice(0, 200)); server.kill(); process.exit(2); }
  const browser = await chromium.launch();
  try {
    // S1 home load
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(700);
      if (!page.url().includes('variant=following')) fail('S1', `expected Following feed, url=${page.url()}`);
      if (await visible(page, 'a[href="/reels/"]')) fail('S1', 'Reels nav link visible');
      if (await visible(page, 'a[href^="/explore"]')) fail('S1', 'Explore nav link visible');
      if (!(await visible(page, '#feed'))) fail('S1', 'feed root hidden');
      if (!(await visible(page, 'article[data-id="1"]'))) fail('S1', 'normal post 1 hidden');
      if (!(await visible(page, 'article[data-id="4"]'))) fail('S1', 'normal post 4 hidden');
      if (!(await visible(page, 'article[data-id="3"]'))) fail('S1', 'post whose caption merely contains "sponsored" was hidden (false positive)');
      if (await visible(page, 'article[data-id="2"]')) fail('S1', 'sponsored post visible');
      if (await visible(page, 'article[data-id="5"]')) fail('S1', 'suggested-posts article visible');
      if (await visible(page, '.sugg')) fail('S1', 'suggested accounts carousel visible');
      await ctx.close();
    }
    // S2 reels feed, S3 explore
    for (const [id, p] of [['S2', '/reels/'], ['S3', '/explore/']]) {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + p); await sleep(900);
      if (new URL(page.url()).pathname !== '/') fail(id, `${p} not redirected, url=${page.url()}`);
      await ctx.close();
    }
    // S4 DM -> reel, swipe blocked; S5 tap works; S6 back to DM scroll released
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/direct/t/1/'); await sleep(500);
      await page.evaluate(() => document.getElementById('reellink').scrollIntoView());
      await page.click('#reellink'); await sleep(600);
      if (new URL(page.url()).pathname !== '/reel/ABC123/') fail('S4', `reel did not open, url=${page.url()}`);
      if (!(await visible(page, '#viewer'))) fail('S4', 'reel viewer not visible');
      await swipeUp(page, 200, 500); await sleep(300);
      const adv = await page.evaluate(() => window.__advanced);
      if (adv || new URL(page.url()).pathname !== '/reel/ABC123/') fail('S4', `swipe advanced to next reel, url=${page.url()}`);
      // S12: touch moves that start on the comments sheet must reach it while the reel lock holds
      // (headless Chromium does not scroll natively from synthetic touches, so the event reaching the sheet is the signal)
      const cBox = await page.evaluate(() => { const r = document.getElementById('comments').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.8 }; });
      await swipeUp(page, cBox.x, cBox.y); await sleep(300);
      if (!(await page.evaluate(() => window.__commentsMoveSeen))) fail('S12', 'touch moves on the comments sheet were swallowed by the reel lock');
      if (await page.evaluate(() => window.__advanced)) fail('S12', 'scrolling the comments advanced the reel');
      await page.mouse.move(200, 400); await page.mouse.wheel(0, 200); await sleep(300);
      if (await page.evaluate(() => window.__advanced)) fail('S4', 'wheel advanced to next reel');
      await page.tap('#like'); await sleep(200);
      if (!(await page.evaluate(() => window.__liked))) fail('S5', 'tap on Like did not register while swipe lock active');
      await page.goBack(); await sleep(600);
      if (new URL(page.url()).pathname !== '/direct/t/1/') fail('S6', `back did not return to DM, url=${page.url()}`);
      await swipeUp(page, 200, 300); await sleep(300);
      if (!(await page.evaluate(() => window.__dmTouch))) fail('S6', 'DM list did not receive touch after leaving reel (lock not released)');
      await ctx.close();
    }
    // S4b /reels/ID form opens
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/reels/XYZ789/'); await sleep(700);
      if (!(await visible(page, '#viewer'))) fail('S4b', `/reels/ID single reel did not open, url=${page.url()}`);
      await ctx.close();
    }
    // S7 app prompts
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(700);
      if (await visible(page, '#openapp')) fail('S7', 'instagram:// link visible');
      if (await visible(page, '#appdialog')) fail('S7', '"Use the app" dialog visible');
      if (await page.evaluate(() => !!document.querySelector('meta[name="apple-itunes-app"]'))) fail('S7', 'apple-itunes-app meta still present');
      await ctx.close();
    }
    // S8 French
    {
      const { ctx, page } = await newPage(browser, { storage: { lang: 'fr' } });
      await page.goto(BASE + '/'); await sleep(700);
      if (await visible(page, 'article[data-id="2"]')) fail('S8', 'Sponsorisé post visible');
      if (await visible(page, '.sugg')) fail('S8', 'Suggestions pour vous carousel visible');
      if (await visible(page, '#appdialog')) fail('S8', "Utiliser l'application dialog visible");
      if (!(await visible(page, 'article[data-id="3"]'))) fail('S8', 'normal post hidden in FR');
      await ctx.close();
    }
    // S9 no reload loop when IG strips the query
    {
      const { ctx, page } = await newPage(browser, { storage: { strip: '1' } });
      let navs = 0;
      page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
      await page.goto(BASE + '/'); await sleep(2500);
      if (navs > 3) fail('S9', `reload loop: ${navs} navigations in 2.5s after Instagram stripped the query`);
      await ctx.close();
    }
    // S10 feed root survives suggested-block hiding (covered in S1 too) + nothing else hidden
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(700);
      const n = await visibleCount(page, 'article');
      if (n !== 3) fail('S10', `expected 3 visible articles (1,3,4), got ${n}`);
      if (!(await visible(page, 'nav'))) fail('S10', 'nav hidden');
      await ctx.close();
    }
    // S11 main-thread jank under stress: event-loop lag with the script vs without
    {
      const measure = async (script) => {
        const { ctx, page } = await newPage(browser, { script, storage: { stress: '1' } });
        await ctx.addInitScript(() => {
          window.__lag = 0; let last = performance.now();
          setInterval(() => { const now = performance.now(); window.__lag += Math.max(0, now - last - 10); last = now; }, 10);
        });
        await page.goto(BASE + '/'); await sleep(2600);
        const v = await page.evaluate(() => window.__lag);
        await ctx.close();
        return v;
      };
      const base = await measure(false);
      const withScript = await measure(true);
      const delta = withScript - base;
      if (delta > 300) fail('S11', `script added ${delta.toFixed(0)}ms of main-thread lag over 2.5s of feed mutations (limit 300ms)`);
      console.log(`info S11: lag baseline ${base.toFixed(0)}ms, with script ${withScript.toFixed(0)}ms`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  for (const f of fails) console.log(f);
  console.log(fails.length ? `${fails.length} failing` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.log('FAIL harness: ' + e.message); process.exit(2); });
