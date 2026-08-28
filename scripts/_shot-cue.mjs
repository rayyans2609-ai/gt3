import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-cue', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 15000));
await p.screenshot({ path: '/tmp/cue_before.png' });
for (let i = 0; i < 4; i++) { await p.mouse.wheel({ deltaY: 90 }); await new Promise((r) => setTimeout(r, 60)); }
await new Promise((r) => setTimeout(r, 250));
await p.screenshot({ path: '/tmp/cue_fwd.png' });
for (let i = 0; i < 4; i++) { await p.mouse.wheel({ deltaY: -90 }); await new Promise((r) => setTimeout(r, 60)); }
await new Promise((r) => setTimeout(r, 250));
await p.screenshot({ path: '/tmp/cue_rev.png' });
await p.screenshot({ path: '/tmp/cue_full.png' });
console.log('shots done');
await b.close();
