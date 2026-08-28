// Verifies SPEC §11 HUD panel parallax: panels must translate with the cursor,
// and the reveal transforms on .hud-approach / #spec-panel must survive untouched.
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-chrome-parallax', '--no-first-run',
         '--window-size=1600,900', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3500));

const SEL = ['#hud-topleft', '#hud-topright', '#hud-bottomleft', '#hud-routemap', '#spec-panel'];
const read = () => page.evaluate((sel) => Object.fromEntries(sel.map((s) => {
  const el = document.querySelector(s);
  if (!el) return [s, null];
  const cs = getComputedStyle(el);
  return [s, { translate: cs.translate, transform: cs.transform }];
})), SEL);

await page.mouse.move(100, 100);
await new Promise((r) => setTimeout(r, 900));
const left = await read();
await page.mouse.move(1500, 800);
await new Promise((r) => setTimeout(r, 900));
const right = await read();

console.log('panel                | translate @topleft -> @bottomright        | transform (must be unchanged)');
for (const s of SEL) {
  const a = left[s], b = right[s];
  if (!a) { console.log(`${s.padEnd(20)} | MISSING`); continue; }
  const moved = a.translate !== b.translate;
  const tfStable = a.transform === b.transform;
  console.log(`${s.padEnd(20)} | ${String(a.translate).padEnd(14)} -> ${String(b.translate).padEnd(14)} ${moved ? 'MOVED' : '*** STATIC ***'} | ${tfStable ? 'stable' : '*** TRANSFORM CHANGED ***'} (${b.transform})`);
}
console.log('--- errors ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
