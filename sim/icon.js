// Render a full-bleed 1024x1024 Instagram-style icon (gradient + camera glyph) to icon/instagram-icon.png.
// Full-bleed on purpose: iOS applies its own rounded mask to Home Screen icons, so baked-in corners would show.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="a" cx="18%" cy="105%" r="130%">
      <stop offset="0" stop-color="#fdf497"/><stop offset="0.08" stop-color="#fdf497"/>
      <stop offset="0.35" stop-color="#fd5949"/><stop offset="0.62" stop-color="#d6249f"/><stop offset="1" stop-color="#285AEB"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#a)"/>
  <rect x="196" y="196" width="632" height="632" rx="176" fill="none" stroke="#fff" stroke-width="66"/>
  <circle cx="512" cy="512" r="150" fill="none" stroke="#fff" stroke-width="66"/>
  <circle cx="690" cy="334" r="44" fill="#fff"/>
</svg>`;
(async () => {
  const out = path.join(__dirname, '..', 'icon'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: path.join(out, 'instagram-icon.png'), clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  await browser.close();
  console.log('wrote icon/instagram-icon.png');
})();
