import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-vm', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const failed = [], errs = [];
p.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 90)}`));
p.on('response', (r) => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`); });
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 15000));
const r = await p.evaluate(() => {
  const g = window.__gt3; const ph = [];
  g.scene.traverse((o) => { if (/placeholder/i.test(o.name || '')) ph.push(o.name); });
  return { placeholders: ph, glb: performance.getEntriesByType('resource')
    .filter((e) => e.name.endsWith('.glb')).map((e) => [e.name.split('/').pop(), Math.round(e.duration)]) };
});
console.log('placeholders in scene:', r.placeholders.length ? r.placeholders : 'NONE');
console.log('GLBs loaded:', r.glb.length, r.glb.map(([n, d]) => `${n}:${d}ms`).join(' '));
console.log('failed requests:', failed.length ? failed.slice(0, 6) : 'none');
console.log('console errors:', errs.length ? errs.slice(0, 4) : 'none');
await b.close();
