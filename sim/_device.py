"""Shared bits for the on-device probes: connect over usbmux, pick Instagram tabs, evaluate JS with a timeout.
Requires USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd in the environment (see device-attach.sh)."""
import asyncio, json, re
from contextlib import asynccontextmanager
from pathlib import Path
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service

SAFARI = "com.apple.mobilesafari"
# the version the repo's script declares; a tab reporting another one has not picked up the latest push
REPO_VERSION = re.search(r"SITE_VERSION = '(\d+)'", (Path(__file__).parent.parent / "instagram-focus.user.js").read_text()).group(1)
TILES = 'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]:not([href="/reels/"]), a[href*="/tv/"]'  # the script's TILES
STATE = r"""JSON.stringify((() => {
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && !e.closest('[style*="display: none"]');
  const vids = [...document.querySelectorAll('video')];
  return {
    url: location.href,
    version: document.documentElement.dataset.focusVersion || null,
    locked: document.documentElement.hasAttribute('data-focus-locked'),
    standalone: !!navigator.standalone,
    reelsTab: [...document.querySelectorAll('a[href="/reels/"]')].some(vis),
    explore: [...document.querySelectorAll('a[href^="/explore"]')].some(vis),
    smartBannerMeta: !!document.querySelector('meta[name="apple-itunes-app"]'),
    videos: vids.length,
    bigVideo: vids.some((v) => { const r = v.getBoundingClientRect(); return r.height >= innerHeight * 0.85 && r.width >= innerWidth * 0.6; }),
  };
})())"""


@asynccontextmanager
async def inspector():
    lockdown = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(lockdown) as insp:
        yield insp


async def instagram_pages(insp, safari_only=True):
    pages = await insp.get_open_application_pages(timeout=3)
    return [p for p in pages if p.page.web_url and "instagram.com" in p.page.web_url
            and (not safari_only or p.application.bundle == SAFARI)]


async def session(insp, ap):
    s = await insp.inspector_session(ap.application, ap.page)
    await s.runtime_enable()
    return s


async def ev(s, expr, timeout=15):
    """Evaluate JS; JSON strings come back parsed. Returns {'error': ...} on timeout instead of raising."""
    try:
        v = await asyncio.wait_for(s.runtime_evaluate(expr, return_by_value=True), timeout)
    except asyncio.TimeoutError:
        return {"error": f"timeout after {timeout}s (page JavaScript not answering: phone locked?)"}
    except Exception as e:  # an exception thrown in the page, or the inspector link dropping
        return {"error": f"{type(e).__name__}: {str(e)[:120]}"}
    if isinstance(v, str):
        try: return json.loads(v)
        except ValueError: return v
    return v


def out(label, value):
    print(f"{label}: {value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)}", flush=True)
