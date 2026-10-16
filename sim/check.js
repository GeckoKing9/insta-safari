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
async function newPage(browser, { script = true, storage = {}, cfg = {}, device = 'iPhone 15 Pro Max', copies = 1 } = {}) {
  const ctx = await browser.newContext({ ...devices[device], locale: 'en-CA' });
  await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  let src = SCRIPT;
  for (const [from, to] of Object.entries(cfg)) { if (!src.includes(from)) throw new Error(`CFG line not found: ${from}`); src = src.replace(from, to); }
  if (script) for (let i = 0; i < copies; i++) await ctx.addInitScript(src);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000); // a missing target fails its scenario fast instead of stalling 30 s
  // S0 sentinel: any uncaught error in the page (the script's or the fixture's) is a failure
  page.on('pageerror', (e) => fail('S0', `page error: ${e.message.slice(0, 120)}`));
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

// The visible links along the bottom edge (the tab bar, Instagram's or the script's), left to right
const bottomTabs = (page) => page.evaluate(() => [...document.querySelectorAll('a[href]')]
  .filter((a) => { const r = a.getBoundingClientRect(); if (!a.checkVisibility({ visibilityProperty: true }) || !r.width || r.top < innerHeight - 60 || r.bottom > innerHeight + 1) return false;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && a.contains(hit); }) // on screen and not clipped or covered
  .map((a) => { const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), cx: r.x + r.width / 2, top: r.top, w: innerWidth, current: a.getAttribute('aria-current') }; })
  .sort((a, b) => a.cx - b.cx));
const TAB_HREFS = '/,/explore/,/direct/inbox/,/me/';
// exactly the 4 tabs, mirror-symmetric, equal gaps (1 px tolerance); returns the centres for comparisons
const checkTabs = async (page, id, where) => {
  const tabs = await bottomTabs(page);
  const hrefs = tabs.map((t) => t.href).join(',');
  if (hrefs !== TAB_HREFS) { fail(id, `${where}: bottom tabs are ${hrefs || 'none'}, expected ${TAB_HREFS}`); return null; }
  const c = tabs.map((t) => t.cx), w = tabs[0].w, gaps = [c[1] - c[0], c[2] - c[1], c[3] - c[2]];
  if (Math.max(...gaps) - Math.min(...gaps) > 1) fail(id, `${where}: tab gaps uneven ${gaps.map(Math.round).join('/')}`);
  if (Math.abs(c[0] - (w - c[3])) > 1) fail(id, `${where}: tabs off-centre, left margin ${Math.round(c[0])} vs right ${Math.round(w - c[3])}`);
  return c;
};
const sameDoc = (page, doc) => page.evaluate((d) => window.__doc === d, doc);

// a tap that cannot happen (element missing or hidden) is a scenario failure, not a harness crash
const tapOr = (page, sel, id) => page.click(sel, { timeout: 3000 }).then(() => true, () => { fail(id, `could not tap ${sel}, url=${page.url()}`); return false; });

async function serverUp() { try { const r = await fetch(BASE + '/'); return r.ok; } catch { return false; } }

async function main() {
  // S0 the two version numbers agree: Userscripts offers an update only when @version grows
  const metaV = (SCRIPT.match(/@version\s+(\S+)/) || [])[1], siteV = (SCRIPT.match(/SITE_VERSION = '([^']+)'/) || [])[1];
  if (!metaV || metaV !== siteV) fail('S0', `@version ${metaV} and SITE_VERSION ${siteV} differ`);
  if (await serverUp()) { console.log(`FAIL harness: something already listens on ${BASE} (a stale fixture server?)`); process.exit(2); }
  const server = spawn('python3', [path.join(__dirname, 'server.py'), String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] });
  let serverErr = ''; server.stderr.on('data', (d) => { serverErr += d; });
  for (let i = 0; i < 30 && !(await serverUp()); i++) await sleep(100);
  if (!(await serverUp())) { console.log('FAIL harness: fixture server did not start: ' + serverErr.slice(0, 200)); server.kill(); process.exit(2); }
  let browser;
  try {
    browser = await chromium.launch();
    // S1 home load
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(700);
      if (page.url().includes('variant=')) fail('S1', `Home feed expected (followingFeed is off), url=${page.url()}`);
      if (!(await page.evaluate(() => document.documentElement.dataset.focusVersion))) fail('S0', 'script not running (no data-focus-version)');
      if (await visible(page, 'a[href="/reels/"]')) fail('S1', 'Reels nav link visible');
      if (!(await visible(page, 'a[href="/explore/"]'))) fail('S1', 'search tab link hidden (search must stay reachable)');
      if (!(await visible(page, '#feed'))) fail('S1', 'feed root hidden');
      if (!(await visible(page, 'article[data-id="1"]'))) fail('S1', 'normal post 1 hidden');
      if (!(await visible(page, 'article[data-id="4"]'))) fail('S1', 'normal post 4 hidden');
      if (!(await visible(page, 'article[data-id="3"]'))) fail('S1', 'post whose caption merely contains "sponsored" was hidden (false positive)');
      if (!(await visible(page, 'article[data-id="8"]'))) fail('S1', 'friend\'s short caption "Sponsored by my mom lol" was hidden as an ad');
      await sleep(500);
      if (await visible(page, 'article[data-id="9"]')) fail('S1', 'ad whose "Sponsored" label text arrived after insertion stayed visible');
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
    // S3 search tab, opened from the nav: one tap lands on the search page with its box (no blank Explore page
    // in between, no reload, Back goes home); the recommended grid is never visible, not even for a frame
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(600);
      const doc = await page.evaluate(() => window.__doc);
      await tapOr(page, 'a[href="/explore/"]', 'S3');
      // checked at once: the grid must already be hidden when Instagram renders it, not after a polling tick
      const early = await visibleCount(page, '#exploregrid a');
      if (early) fail('S3', `${early} recommended grid tiles visible right after opening the search tab`);
      await sleep(700);
      if (new URL(page.url()).pathname !== '/explore/search/') fail('S3', `search tab did not land on the search page, url=${page.url()}`);
      if (!(await sameDoc(page, doc))) fail('S3', 'opening the search tab reloaded the page');
      if (!(await visible(page, '#searchbox'))) fail('S3', 'search box hidden on the search tab');
      // Cancel on the search page: stays on the (cleared) search page without stacking a history step
      await tapOr(page, '#cancel', 'S3'); await sleep(700);
      if (new URL(page.url()).pathname !== '/explore/search/') fail('S3', `Cancel left the search page for ${page.url()}`);
      await page.goBack(); await sleep(600);
      if (new URL(page.url()).pathname !== '/') fail('S3', `Back from the search page did not go home in one step, url=${page.url()}`);
      await page.goto(BASE + '/explore/'); await sleep(900);
      if (new URL(page.url()).pathname !== '/explore/search/') fail('S3', `a cold load of /explore/ did not land on the search page, url=${page.url()}`);
      await ctx.close();
    }
    // S3b a router that ignores the in-place switch: the Explore page stays on screen with its grid hidden and
    // untappable, then the search page is loaded normally
    {
      const { ctx, page } = await newPage(browser, { storage: { ignorePopstate: '1' } });
      await page.goto(BASE + '/'); await sleep(600);
      await tapOr(page, 'a[href="/explore/"]', 'S3b'); await sleep(300);
      const shown = await visibleCount(page, '#exploregrid a');
      if (shown) fail('S3b', `${shown} recommended grid tiles visible while the search page is not shown yet`);
      for (const href of await page.evaluate(() => [...document.querySelectorAll('#exploregrid a')].map((a) => a.getAttribute('href')))) {
        if (await tappable(page, `#exploregrid a[href="${href}"]`)) fail('S3b', `hidden grid tile ${href} can still be tapped`);
      }
      await sleep(2500);
      if (new URL(page.url()).pathname !== '/explore/search/' || !(await visible(page, '#results'))) fail('S3b', `search page not reached by the fallback, url=${page.url()}`);
      await ctx.close();
    }
    // S20b same router: a tab tapped on the inbox bar falls back to a normal load of the right page
    {
      const { ctx, page } = await newPage(browser, { storage: { ignorePopstate: '1' } });
      await page.goto(BASE + '/direct/inbox/'); await sleep(900);
      const tapped = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href="/me/"]')].find((e) => e.getBoundingClientRect().top >= innerHeight - 60); if (!a) return false; a.click(); return true; });
      if (!tapped) fail('S20b', 'no Profile tab on the inbox');
      await sleep(2500);
      if (new URL(page.url()).pathname !== '/me/' || !(await visible(page, '#other'))) fail('S20b', `Profile tab fallback did not load the profile, url=${page.url()}`);
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
      if (await page.evaluate(() => document.documentElement.hasAttribute('data-focus-search'))) fail('S16', 'tab bar lifted over sheets on a hashtag page');
      await ctx.close();
    }
    // S18 hideSearch: true is the v15 behaviour: no search tab link, /explore/ pages redirect home
    {
      const { ctx, page } = await newPage(browser, { cfg: { 'hideSearch: false,': 'hideSearch: true,' } });
      await page.goto(BASE + '/'); await sleep(600);
      if (await visible(page, 'a[href="/explore/"]')) fail('S18', 'search tab link visible with hideSearch on');
      const three = async (where) => {
        const tabs = await bottomTabs(page), c = tabs.map((x) => x.cx), w = tabs[0]?.w;
        if (tabs.map((x) => x.href).join(',') !== '/,/direct/inbox/,/me/') { fail('S18', `${where}: tabs ${tabs.map((x) => x.href)}`); return; }
        if (Math.abs((c[1] - c[0]) - (c[2] - c[1])) > 1 || Math.abs(c[0] - (w - c[2])) > 1) fail('S18', `${where}: 3 tabs not symmetric ${c.map(Math.round)}`);
      };
      await three('home');
      const doc = await page.evaluate(() => window.__doc);
      await tapOr(page, '#tabbar a[href="/direct/inbox/"]', 'S18'); await sleep(600);
      await three('inbox');
      await page.evaluate(() => [...document.querySelectorAll('a[href="/"]')].find((e) => e.getBoundingClientRect().top >= innerHeight - 60)?.click()); await sleep(2600);
      if (new URL(page.url()).pathname !== '/' || !(await sameDoc(page, doc))) fail('S18', `inbox Home tab with hideSearch: url ${page.url()}, reloaded=${!(await sameDoc(page, doc))}`);
      for (const p of ['/explore/', '/explore/tags/cats/']) {
        await page.goto(BASE + p); await sleep(900);
        if (new URL(page.url()).pathname !== '/') fail('S18', `${p} not redirected with hideSearch on, url=${page.url()}`);
      }
      await page.goto(BASE + '/explorecanada/'); await sleep(900);
      if (new URL(page.url()).pathname !== '/explorecanada/') fail('S18', `the profile /explorecanada/ was redirected as if it were Explore, url=${page.url()}`);
      await ctx.close();
    }
    // S19 the 4 tabs (Home, Search, Messages, Profile) sit mirror-symmetric with equal gaps wherever the bar shows
    for (const p of ['/', '/explore/search/', '/p/X1/']) {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + p); await sleep(700);
      await checkTabs(page, 'S19', p);
      await ctx.close();
    }
    // S20 the DM inbox keeps the same tab bar: same 4 centres, Messages current, the last chat scrolls clear of it,
    // every tab switches page in place (no reload) and leaves exactly one bar; a DM thread keeps no bar
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(700);
      const doc = await page.evaluate(() => window.__doc);
      const home = await checkTabs(page, 'S20', 'home');
      const learned = await page.evaluate(() => ({ s: localStorage.getItem('focusTabs'), bar: document.getElementById('tabbar').hasAttribute('data-focus-bar') }));
      if (!learned.bar || !String(learned.s).includes('"/me/"')) fail('S20', `tab bar not learned from the bottom bar (header logo links to / first): ${JSON.stringify(learned)}`);
      for (const [tab, dest] of [['/explore/', '/explore/search/'], ['/', '/'], ['/me/', '/me/']]) {
        await tapOr(page, '#tabbar a[href="/direct/inbox/"]', 'S20'); await sleep(600);
        if (new URL(page.url()).pathname !== '/direct/inbox/') { fail('S20', `Messages tab did not open the inbox, url=${page.url()}`); break; }
        const inbox = await checkTabs(page, 'S20', 'inbox');
        if (home && inbox && inbox.some((c, i) => Math.abs(c - home[i]) > 1)) fail('S20', `inbox tabs at ${inbox.map(Math.round)} vs home ${home.map(Math.round)}`);
        const cur = (await bottomTabs(page)).filter((t) => t.current === 'page').map((t) => t.href).join(',');
        if (cur !== '/direct/inbox/') fail('S20', `inbox: current tab is "${cur}", expected Messages`);
        if (tab === '/explore/') {
          const clear = await page.evaluate(() => { const l = document.getElementById('inboxlist'); l.scrollTop = l.scrollHeight;
            const last = document.getElementById('lastrow').getBoundingClientRect(), barTop = Math.min(...[...document.querySelectorAll('a[href="/"]')].map((a) => a.getBoundingClientRect().top));
            return last.bottom <= barTop + 1 ? true : `last chat ends at ${Math.round(last.bottom)}, bar starts at ${Math.round(barTop)}`; });
          if (clear !== true) fail('S20', `inbox: ${clear}`);
        }
        const link = await page.evaluate((h) => { const a = [...document.querySelectorAll(`a[href="${h}"]`)].find((e) => e.getBoundingClientRect().top >= innerHeight - 60); if (!a) return false; a.click(); return true; }, tab);
        if (!link) { fail('S20', `inbox: no ${tab} tab to tap`); continue; }
        await sleep(700);
        if (new URL(page.url()).pathname !== dest) fail('S20', `inbox ${tab} tab went to ${page.url()}, expected ${dest}`);
        if (!(await sameDoc(page, doc))) fail('S20', `inbox ${tab} tab reloaded the page`);
        await checkTabs(page, 'S20', `after inbox ${tab} tab`);
      }
      await page.evaluate(() => { history.pushState(null, '', '/direct/t/1/'); window.dispatchEvent(new PopStateEvent('popstate')); }); await sleep(600);
      const inThread = (await bottomTabs(page)).length;
      if (inThread) fail('S20', `DM thread shows ${inThread} tab links over the composer`);
      await ctx.close();
    }
    // S21 a cold load straight into the inbox (nothing remembered yet) still gets the full, symmetric bar
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/direct/inbox/'); await sleep(900);
      await checkTabs(page, 'S21', 'cold inbox');
      await ctx.close();
    }
    // S21b the same cold inbox in French: the Profile tab still finds the account
    {
      const { ctx, page } = await newPage(browser, { storage: { lang: 'fr' } });
      await page.goto(BASE + '/direct/inbox/'); await sleep(900);
      await checkTabs(page, 'S21b', 'cold inbox (fr)');
      await ctx.close();
    }
    // S21c colours are remembered per colour scheme: dark ones learned on home never paint a light-mode inbox
    {
      const { ctx, page } = await newPage(browser);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(BASE + '/'); await sleep(600);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(BASE + '/direct/inbox/'); await sleep(900);
      const bg = await page.evaluate(() => { const b = document.getElementById('focus-tabbar'); return b && getComputedStyle(b).backgroundColor; });
      if (bg !== 'rgb(255, 255, 255)') fail('S21c', `light-mode inbox bar background is ${bg}, expected the light default`);
      await ctx.close();
    }
    // S23 notifications: the suggested-accounts block at the end (heading, accounts, "See All") is hidden like the
    // home carousel; activity rows stay, including one with its own Follow button
    for (const [lang, layout] of [['en', 'flat'], ['fr', 'flat'], ['en', 'nested']]) {
      const { ctx, page } = await newPage(browser, { storage: { lang, notifLayout: layout } });
      await page.goto(BASE + '/notifications/'); await sleep(2300); // the list lands 400 ms after its heading, one more block at 1.5 s
      for (const id of ['n1', 'n2']) if (!(await visible(page, '#' + id))) fail('S23', `${lang}/${layout}: activity row #${id} hidden`);
      for (const id of ['shead', 'slist', 'sall', 'slate']) if (await visible(page, '#' + id)) fail('S23', `${lang}/${layout}: suggested-accounts part #${id} visible`);
      await ctx.close();
    }
    // S24 one tap opens a post shared in a DM: the hover events a finger's tap sends first never reach the page's
    // hover handlers (revealing the message actions made Safari count the tap as a hover); a real mouse still hovers
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/direct/t/1/'); await sleep(500);
      await page.evaluate(() => document.getElementById('sharedmsg').scrollIntoView({ block: 'center' }));
      // the CSS half: Safari puts :hover on what a finger taps; Chromium's emulated tap does not, a mouse move does. On a
      // phone (the emulation matches any-hover: none) no :hover rule may reveal anything
      const row = await page.evaluate(() => { const r = document.getElementById('msgtext').getBoundingClientRect(); return { x: r.x + 10, y: r.y + 10 }; });
      await page.mouse.move(row.x, row.y); await sleep(300);
      const op = await page.evaluate(() => [document.getElementById('sharedmsg').matches(':hover'), getComputedStyle(document.getElementById('cssactions')).opacity]);
      if (!op[0]) fail('S24', 'harness: the row did not get :hover from the mouse move');
      else if (op[1] !== '0') fail('S24', `a CSS :hover rule revealed the message actions (opacity ${op[1]}): Safari takes such a tap as a hover`);
      await page.mouse.move(5, 5); await sleep(1100); // leave the row; past the finger window before the taps below
      await page.evaluate(() => { window.__hoverRevealed = false; document.getElementById('sharedmsg').scrollIntoView({ block: 'center' }); });
      // a tap on something else first: the next tap's hover then arrives as that element's out event (React's enter)
      await page.tap('.rowfirst'); await sleep(300);
      await page.evaluate(() => { window.__hoverRevealed = false; });
      await page.tap('#sharedpost'); await sleep(500);
      if (await page.evaluate(() => window.__hoverRevealed)) fail('S24', "a finger's tap ran the page's hover handler (Safari swallows such a tap as a hover)");
      // sanity only: Chromium never turns a tap into a hover-only tap, so this cannot fail for the bug itself
      if (new URL(page.url()).pathname !== '/p/S1/') fail('S24', `the tap did not open the shared post, url=${page.url()}`);
      await page.goBack(); await sleep(600);
      // a clickable part of the card that is not a link (cursor: pointer): still no hover first
      await page.evaluate(() => { window.__hoverRevealed = false; document.getElementById('sharedmsg').scrollIntoView({ block: 'center' }); });
      await page.tap('.rowfirst'); await sleep(300);
      await page.evaluate(() => { window.__hoverRevealed = false; });
      await page.tap('#sharedcaption'); await sleep(500);
      if (await page.evaluate(() => window.__hoverRevealed)) fail('S24', 'a tap on a clickable (cursor: pointer) part of the shared post ran the hover handler');
      await page.goBack(); await sleep(600);
      // a plain text message is not clickable: its tap keeps the hover, so React / Reply / More stay reachable
      await page.evaluate(() => document.getElementById('textmsg').scrollIntoView({ block: 'center' }));
      await page.tap('#textbubble'); await sleep(400);
      if (!(await page.evaluate(() => window.__textRevealed))) fail('S24', 'tapping a text message no longer reveals its React / Reply / More (only hover reaches them)');
      await sleep(1100);
      await page.evaluate(() => { window.__hoverRevealed = false; document.getElementById('sharedmsg').scrollIntoView({ block: 'center' }); });
      const box = await page.evaluate(() => { const r = document.getElementById('sharedpost').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.move(box.x, box.y); await sleep(200);
      if (!(await page.evaluate(() => window.__hoverRevealed))) fail('S24', 'a real mouse no longer hovers (iPad pointer)');
      await ctx.close();
    }
    // S22 a double tap never zooms the page: touch-action manipulation on the page and on links
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/'); await sleep(600);
      const ta = await page.evaluate(() => [document.documentElement, document.body, document.querySelector('article a, article b')].map((e) => getComputedStyle(e).touchAction).join(','));
      if (ta.split(',').some((v) => v !== 'manipulation')) fail('S22', `touch-action is ${ta}, expected manipulation everywhere`);
      await ctx.close();
    }
    // S25 user content keeps its links: an App Store link a friend sends stays (only Instagram's own app prompts go)
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/direct/t/1/'); await sleep(500);
      if (!(await page.evaluate(() => getComputedStyle(document.getElementById('appstorelink')).display !== 'none'))) fail('S25', 'an App Store link sent in a DM was hidden');
      await page.goto(BASE + '/explore/people/'); await sleep(900);
      if (new URL(page.url()).pathname !== '/') fail('S25', `the suggested-accounts page /explore/people/ stayed open, url=${page.url()}`);
      await ctx.close();
    }
    // S26 Home never goes blank: a suggestions unit that arrives before any post in its column hides only itself
    {
      const { ctx, page } = await newPage(browser, { storage: { lateFeed: '1' } });
      await page.goto(BASE + '/'); await sleep(1600);
      if (!(await visible(page, '#stories'))) fail('S26', 'the stories tray went blank with the suggestions unit');
      if ((await visibleCount(page, 'article')) !== 2) fail('S26', `posts added after the suggestions unit are not visible (${await visibleCount(page, 'article')} of 2)`);
      if (await visible(page, '.sugg')) fail('S26', 'suggested-accounts unit visible');
      await ctx.close();
    }
    // S27 two installed copies of the script behave like one (one inbox bar, Cancel steps back once)
    {
      const { ctx, page } = await newPage(browser, { copies: 2 });
      await page.goto(BASE + '/direct/inbox/'); await sleep(900);
      const bars = await page.evaluate(() => document.querySelectorAll('#focus-tabbar').length);
      if (bars !== 1) fail('S27', `${bars} inbox tab bars with the script installed twice`);
      await ctx.close();
    }
    // S29 the phone tab bar is drawn only on a phone layout, not on iPad / desktop widths (side navigation)
    {
      const { ctx, page } = await newPage(browser, { device: 'iPad Pro 11 landscape' });
      await page.goto(BASE + '/direct/inbox/'); await sleep(900);
      if (await page.evaluate(() => !!document.getElementById('focus-tabbar'))) fail('S29', 'phone tab bar drawn on an iPad-width layout');
      await ctx.close();
    }
    // S30 calls: a DM thread gets Audio and Video call buttons (Instagram shows them on desktop only) that open
    // Instagram's call page for this thread in a new tab, like its desktop buttons do (window.open recorded, not run)
    {
      const { ctx, page } = await newPage(browser, { storage: { stubOpen: '1' } });
      await page.goto(BASE + '/direct/t/1/'); await sleep(600);
      const order = await page.evaluate(() => [...document.querySelectorAll('#threadhead [aria-label]')].map((e) => e.getAttribute('aria-label')).join(','));
      if (!/Audio call.*Video call.*Conversation information/.test(order)) fail('S30', `thread header is ${order}, expected Audio call and Video call before Conversation information`);
      for (const [label, video] of [['Audio call', 'false'], ['Video call', 'true']]) {
        await page.evaluate(() => { window.__opened = []; });
        await tapOr(page, `#threadhead [role="button"][aria-label="${label}"]`, 'S30'); await sleep(200);
        const opened = await page.evaluate(() => window.__opened.filter((o) => o.includes('/call/')).join(' '));
        if (!opened.endsWith(`/call/?has_video=${video}&ig_thread_id=1|_blank`)) fail('S30', `${label} opened "${opened}"`);
      }
      // another conversation, reached in place: its own id, never the previous person's
      await page.evaluate(() => { history.pushState(null, '', '/direct/t/2/'); window.dispatchEvent(new PopStateEvent('popstate')); }); await sleep(600);
      await page.evaluate(() => { window.__opened = []; });
      await tapOr(page, '#threadhead [role="button"][aria-label="Video call"]', 'S30'); await sleep(200);
      const second = await page.evaluate(() => window.__opened.filter((o) => o.includes('/call/')).join(' '));
      if (!second.endsWith('/call/?has_video=true&ig_thread_id=2|_blank')) fail('S30', `after moving to conversation 2, Video call opened "${second}"`);
      // keyboard: Enter on a focused call button
      await page.evaluate(() => { window.__opened = []; document.querySelector('#threadhead [aria-label="Audio call"]').focus(); });
      await page.keyboard.press('Enter'); await sleep(200);
      if (!(await page.evaluate(() => window.__opened.length))) fail('S30', 'Enter on a focused call button did nothing');
      await page.goto(BASE + '/direct/inbox/'); await sleep(600);
      if (await page.evaluate(() => !!document.querySelector('[aria-label="Audio call"]'))) fail('S30', 'call buttons outside a thread');
      await ctx.close();
    }
    // S31 the call page believes it runs in Mac Safari before Instagram's first script (its gate allows desktop
    // Safari 16+ only), despite a nonce-only script policy; other pages keep the real user agent
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/call/?has_video=false&ig_thread_id=1'); await sleep(600);
      const seen = await page.evaluate(() => [window.__uaAtFirstScript, window.__platformAtFirstScript]);
      if (!/Macintosh/.test(seen[0] || '') || /iPhone|Mobile\//.test(seen[0] || '')) fail('S31', `call page's first script saw "${seen[0]}"`);
      if (seen[1] !== 'MacIntel') fail('S31', `call page's first script saw platform "${seen[1]}"`);
      const marks = await page.evaluate(() => [document.documentElement.dataset.focusCallUa, getComputedStyle(document.documentElement).touchAction,
        [...document.styleSheets].length]);
      if (marks[0] !== 'early') fail('S31', `the override is marked "${marks[0]}", expected "early" (before Instagram's first script)`);
      // a video call's big remote video sits in a scrolling box: the reel lock must stay off on the call page
      await page.evaluate(() => { const box = document.createElement('div'); box.id = 'callvideo'; box.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:-1';
        box.innerHTML = '<video muted playsinline style="display:block;width:100%;height:96vh"></video><div style="height:300px"></div>'; document.body.append(box); });
      await sleep(700);
      if (await page.evaluate(() => document.documentElement.hasAttribute('data-focus-locked'))) fail('S31', 'the reel swipe lock engaged on the call page (a video call\'s video is not a reel)');
      await page.evaluate(() => document.getElementById('callvideo').remove());
      // the call page keeps its own :hover (Instagram's desktop call controls appear on hover of the call stage)
      const live = await page.evaluate(() => [...document.styleSheets].flatMap((sh) => [...sh.cssRules]).some((r) => r.selectorText === '#stage:hover #controls'));
      if (!live) fail('S31', 'the one-tap :hover rewrite ran on the call page (its hover-revealed controls would never show)');
      await page.goto(BASE + '/'); await sleep(500);
      if (!(await page.evaluate(() => /iPhone/.test(navigator.userAgent)))) fail('S31', 'the Mac user agent leaked outside the call page');
      await ctx.close();
    }
    // S32 the call gate opens even when Instagram already computed it from the iPhone identity (measured on the phone:
    // the script starts late there, isSupportedOutboundClient false, so Start call could not reach anyone)
    for (const pre of ['0', '1']) {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + `/call/?has_video=true&ig_thread_id=1&pre=${pre}`); await sleep(900);
      const g = await page.evaluate(() => { const m = window.require('RTWebIncomingRingConfiguration');
        return [m && m.isSupportedOutboundClient(), m && m.isSupportedClient(), document.documentElement.dataset.focusCallGate]; });
      if (g[0] !== true || g[1] !== true) fail('S32', `pre=${pre}: call gate still closed (outbound ${g[0]}, client ${g[1]})`);
      if (pre === '1' && g[2] !== 'patched') fail('S32', `pre=1: gate not marked patched (${g[2]})`);
      await ctx.close();
    }
    // S33 the call screen fits the phone: Instagram lays it out as a 1024 px desktop row, so on a phone Start call sat
    // off the right edge (measured: x 499-587 on a 430 px screen) and could not be tapped
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/call/?has_video=false&ig_thread_id=1'); await sleep(900);
      // as it sits: no scrolling first (scrollIntoView would move an overflow:hidden box, which a finger cannot)
      for (const sel of ['#startcall', '#mutebtn', '#speakerbtn', '#settingsbtn']) {
        const where = await page.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect();
          const inside = r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1;
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return inside && !!hit && (hit === e || e.contains(hit)) ? true : `x ${Math.round(r.left)}-${Math.round(r.right)} on a ${innerWidth} px screen`; }, sel);
        if (where !== true) fail('S33', `${sel} cannot be tapped on the call page: ${where}`);
      }
      // the preview's own controls stay side by side (a row of small buttons is never stacked)
      const tops = await page.evaluate(() => ['#mutebtn', '#speakerbtn', '#settingsbtn'].map((q) => Math.round(document.querySelector(q).getBoundingClientRect().top)));
      if (new Set(tops).size !== 1) fail('S33', `the preview's buttons were stacked on top of each other (tops ${tops})`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) fail('S33', `the call page is ${wide} px wider than the screen`);
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
      if (!(await page.evaluate(() => document.documentElement.hasAttribute('data-focus-locked')))) fail('S4', 'lock state not exposed (data-focus-locked)');
      await swipeUp(page, 200, 400); await sleep(300);
      const adv = await page.evaluate(() => window.__advanced);
      if (adv || new URL(page.url()).pathname !== '/reel/ABC123/') fail('S4', `swipe advanced to next reel, url=${page.url()}`);
      // S12: touch moves that start on the comments sheet must reach it while the reel lock holds
      // (headless Chromium does not scroll natively from synthetic touches, so the event reaching the sheet is the signal)
      const cBox = await page.evaluate(() => { const r = document.getElementById('comments').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.8 }; });
      await swipeUp(page, cBox.x, cBox.y); await sleep(300);
      if (!(await page.evaluate(() => window.__commentsMoveSeen))) fail('S12', 'touch moves on the comments sheet were swallowed by the reel lock');
      const cap = await page.evaluate(() => { const r = document.getElementById('caption').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.8 }; });
      await swipeUp(page, cap.x, cap.y); await sleep(300);
      if (!(await page.evaluate(() => window.__captionMoveSeen))) fail('S12', 'touch moves on a scrollable caption inside the reel box were swallowed');
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
    // S4c the lock holds against a scroll that comes in small steps with no finger down (smooth scrolling, keys):
    // each step under half a reel used to be accepted as Instagram re-centring, so 40 steps walked to the next reel
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/reel/ABC123/'); await sleep(700);
      for (let i = 0; i < 40; i++) { await page.evaluate(() => { const v = document.getElementById('viewer'); if (v) v.scrollTop += 15; }); await sleep(15); }
      await sleep(300);
      const st = await page.evaluate(() => [window.__advanced, document.getElementById('viewer')?.scrollTop]);
      if (st[0] || st[1] > 150) fail('S4c', `stepwise scrolling walked the locked reel box to ${st[1]} px (advanced=${st[0]})`);
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
      const { ctx, page } = await newPage(browser, { storage: { strip: '1' }, cfg: { 'followingFeed: false,': 'followingFeed: true,' } });
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
      if (n !== 6) fail('S10', `expected 6 visible articles (1,3,4,5,7,8), got ${n}`);
      if (!(await visible(page, '#tabbar'))) fail('S10', 'tab bar hidden');
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
    await browser?.close();
    server.kill();
  }
  for (const f of fails) console.log(f);
  console.log(fails.length ? `${fails.length} failing` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
}
// a crash still reports what had already failed, then the crash itself
main().catch((e) => { for (const f of fails) console.log(f); console.log('FAIL harness: ' + e.message.split('\n')[0]); process.exit(2); });
