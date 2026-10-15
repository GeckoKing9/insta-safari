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

// cfg: CFG lines to flip, e.g. { 'hideSearch: false,': 'hideSearch: true,' }; a line that is not in the script fails loudly
async function newPage(browser, { script = true, storage = {}, cfg = {} } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro Max'], locale: 'en-CA' });
  await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  let src = SCRIPT;
  for (const [from, to] of Object.entries(cfg)) { if (!src.includes(from)) throw new Error(`CFG line not found: ${from}`); src = src.replace(from, to); }
  if (script) await ctx.addInitScript(src);
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

// checkVisibility() also covers position:fixed elements, whose offsetParent is always null; visibility:hidden counts as hidden
const VIS = { visibilityProperty: true };
const visible = (page, sel) => page.evaluate(([s, o]) => { const e = document.querySelector(s); return !!e && e.checkVisibility(o); }, [sel, VIS]);
const visibleCount = (page, sel) => page.evaluate(([s, o]) => [...document.querySelectorAll(s)].filter((e) => e.checkVisibility(o)).length, [sel, VIS]);
// what a finger at the centre of the element would land on: the element itself, or something under it if it is hidden
const tappable = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return false;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return !!hit && (hit === e || e.contains(hit));
}, sel);

// a tap that cannot happen (element missing or hidden) is a scenario failure, not a harness crash
const tapOr = (page, sel, id) => page.click(sel, { timeout: 3000 }).then(() => true, () => { fail(id, `could not tap ${sel}, url=${page.url()}`); return false; });

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
      if (page.url().includes('variant=')) fail('S1', `Home feed expected (followingFeed is off), url=${page.url()}`);
      if (await visible(page, 'a[href="/reels/"]')) fail('S1', 'Reels nav link visible');
      if (!(await visible(page, 'a[href="/explore/"]'))) fail('S1', 'search tab link hidden (search must stay reachable)');
      if (!(await visible(page, '#feed'))) fail('S1', 'feed root hidden');
      if (!(await visible(page, 'article[data-id="1"]'))) fail('S1', 'normal post 1 hidden');
      if (!(await visible(page, 'article[data-id="4"]'))) fail('S1', 'normal post 4 hidden');
      if (!(await visible(page, 'article[data-id="3"]'))) fail('S1', 'post whose caption merely contains "sponsored" was hidden (false positive)');
      if (await visible(page, 'article[data-id="2"]')) fail('S1', 'sponsored post visible');
      if (!(await visible(page, 'article[data-id="5"]'))) fail('S1', 'recommended ("Suggested posts") article hidden although hideSuggestedPosts is off');
      if (await visible(page, '.sugg')) fail('S1', 'suggested accounts carousel visible');
      // S14: ad recognised by its off-site call-to-action; organic post with a "Learn more" button stays
      if (await visible(page, 'article[data-id="6"]')) fail('S14', 'ad with an off-site "Shop now" link visible');
      if (!(await visible(page, 'article[data-id="7"]'))) fail('S14', 'organic post with a "Learn more" button was hidden');
      await ctx.close();
    }
    // S2 reels feed
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/reels/'); await sleep(900);
      if (new URL(page.url()).pathname !== '/') fail('S2', `/reels/ not redirected, url=${page.url()}`);
      await ctx.close();
    }
    // S3 search tab, opened from the nav: it stays, the search box works, the recommended grid under it is
    // hidden (hideExplore) and its tiles cannot be tapped
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(600);
      await tapOr(page, 'a[href="/explore/"]', 'S3');
      // checked at once: the grid must already be hidden when Instagram renders it, not after a polling tick
      const early = await visibleCount(page, '#exploregrid a');
      if (early) fail('S3', `${early} recommended grid tiles visible right after opening the search tab`);
      await sleep(700);
      if (new URL(page.url()).pathname !== '/explore/') fail('S3', `search tab did not stay open, url=${page.url()}`);
      if (!(await visible(page, '#searchbox'))) fail('S3', 'search box hidden on the search tab');
      const shown = await visibleCount(page, '#exploregrid a');
      if (shown) fail('S3', `${shown} recommended grid tiles visible on the search tab`);
      for (const href of await page.evaluate(() => [...document.querySelectorAll('#exploregrid a')].map((a) => a.getAttribute('href')))) {
        if (await tappable(page, `#exploregrid a[href="${href}"]`)) fail('S3', `hidden grid tile ${href} can still be tapped`);
      }
      await ctx.close();
    }
    // S16 searching: box -> results (accounts, hashtags) -> keyword grid; a reel opened from the results is
    // locked to that one reel; back on the results the grid is still there; hashtag pages show their grid
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/explore/'); await sleep(700);
      if (await tapOr(page, '#searchbox', 'S16')) {
        await sleep(400);
        if (new URL(page.url()).pathname !== '/explore/search/') fail('S16', `search page did not open, url=${page.url()}`);
        if (!(await visible(page, '#acclink')) || !(await visible(page, '#taglink'))) fail('S16', 'search results (account / hashtag) hidden');
        await page.fill('#searchbox', 'cats'); await page.press('#searchbox', 'Enter'); await sleep(700);
        if (!page.url().includes('/explore/search/keyword/')) fail('S16', `keyword search did not run, url=${page.url()}`);
        const kw = await visibleCount(page, '#kwgrid a');
        if (kw !== 2) fail('S16', `keyword results grid: ${kw} of 2 tiles visible`);
        if (await tapOr(page, '#kwreel', 'S16')) {
          await sleep(700);
          if (new URL(page.url()).pathname !== '/reel/K1/') fail('S16', `reel from the results did not open, url=${page.url()}`);
          await swipeUp(page, 200, 400); await sleep(300);
          if (await page.evaluate(() => window.__advanced)) fail('S16', 'swipe on a reel opened from search advanced to the next reel');
          await page.goBack(); await sleep(700);
          if (!(await visible(page, '#kwreel'))) fail('S16', `keyword grid hidden after coming back from the reel, url=${page.url()}`);
        }
      }
      await page.goto(BASE + '/explore/tags/cats/'); await sleep(900);
      if (new URL(page.url()).pathname !== '/explore/tags/cats/') fail('S16', `hashtag page redirected, url=${page.url()}`);
      if (!(await visible(page, '#taggrid a'))) fail('S16', 'hashtag results grid hidden');
      await ctx.close();
    }
    // S18 hideSearch: true is the v15 behaviour: no search tab link, /explore/ pages redirect home
    {
      const { ctx, page } = await newPage(browser, { cfg: { 'hideSearch: false,': 'hideSearch: true,' } });
      await page.goto(BASE + '/'); await sleep(600);
      if (await visible(page, 'a[href="/explore/"]')) fail('S18', 'search tab link visible with hideSearch on');
      for (const p of ['/explore/', '/explore/tags/cats/']) {
        await page.goto(BASE + p); await sleep(900);
        if (new URL(page.url()).pathname !== '/') fail('S18', `${p} not redirected with hideSearch on, url=${page.url()}`);
      }
      await ctx.close();
    }
    // S17 a reel linked as /username/reel/ID/ (Instagram's newer grid links) gets the same lock
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/someone/reel/T1/'); await sleep(700);
      if (!(await visible(page, '#viewer'))) fail('S17', `/username/reel/ID did not open, url=${page.url()}`);
      await swipeUp(page, 200, 400); await sleep(300);
      if (await page.evaluate(() => window.__advanced)) fail('S17', 'swipe on a /username/reel/ID page advanced to the next reel');
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
      await swipeUp(page, 200, 400); await sleep(300);
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
      if (n !== 5) fail('S10', `expected 5 visible articles (1,3,4,5,7), got ${n}`);
      if (!(await visible(page, 'nav'))) fail('S10', 'nav hidden');
      await ctx.close();
    }
    // S13: a reel shared in a DM opens as an overlay (no URL change): the lock must engage there,
    // swipes in the overlay must not advance, and closing it must release the DM list again
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/direct/t/1/'); await sleep(500);
      await page.evaluate(() => document.getElementById('reelcard').scrollIntoView());
      await page.click('#reelcard'); await sleep(900);
      if (!(await visible(page, '#overlay'))) fail('S13', 'overlay did not open');
      if (new URL(page.url()).pathname !== '/direct/t/1/') fail('S13', `URL changed on overlay open: ${page.url()}`);
      await swipeUp(page, 200, 400); await sleep(300);
      if (await page.evaluate(() => window.__oadvanced)) fail('S13', 'swipe inside the DM reel overlay advanced to the next reel (lock not engaged without a URL change)');
      await page.tap('#olike'); await sleep(200);
      await page.click('#oclose'); await sleep(600);
      if (await visible(page, '#overlay')) fail('S13', 'overlay still open after close');
      await page.evaluate(() => { window.__dmTouch = false; });
      await swipeUp(page, 200, 300); await sleep(300);
      if (!(await page.evaluate(() => window.__dmTouch))) fail('S13', 'DM list no longer receives touches after the overlay closed (lock not released)');
      // S15: swipe immediately after the overlay opens, before any 400/500 ms tick could pin the box
      await page.evaluate(() => document.getElementById('reelcard').scrollIntoView());
      await page.click('#reelcard'); await sleep(40);
      await swipeUp(page, 200, 400); await sleep(300);
      if (await page.evaluate(() => window.__oadvanced)) fail('S15', 'a swipe right after the overlay opened advanced the reel (box not pinned yet)');
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
