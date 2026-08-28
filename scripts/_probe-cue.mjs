import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-pc', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 12000));
console.log(JSON.stringify(await p.evaluate(() => {
  const out = {};
  for (const sel of ['#hud-bottomleft', '.hud-telemetry', '#hud-topleft']) {
    const e = document.querySelector(sel); if (!e) { out[sel] = null; continue; }
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    out[sel] = { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
                 w: Math.round(r.width), pos: cs.position, display: cs.display, flexDir: cs.flexDirection };
  }
  // Anything newly added for the direction cue
  const cue = [...document.querySelectorAll('[class*="direction"],[class*="dir"],[class*="scrollcue"],[class*="axis"]')]
    .map((e) => { const r = e.getBoundingClientRect();
      return { cls: e.className, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width),
               text: e.textContent.trim().slice(0, 30) }; });
  return { out, cue };
}), null, 1));
await b.close();
