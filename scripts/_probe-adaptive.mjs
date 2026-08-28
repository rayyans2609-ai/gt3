import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-ad', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await p.waitForFunction(() => window.__gt3?.probe, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * 0.5, behavior: 'instant' }));
await new Promise((r) => setTimeout(r, 2000));
console.log('at rest :', JSON.stringify(await p.evaluate(() => window.__gt3.probe())));
for (let i = 0; i < 25; i++) { await p.mouse.wheel({ deltaY: 250 }); await new Promise((r) => setTimeout(r, 16)); }
console.log('scroll 1:', JSON.stringify(await p.evaluate(() => window.__gt3.probe())));
for (let i = 0; i < 25; i++) { await p.mouse.wheel({ deltaY: 250 }); await new Promise((r) => setTimeout(r, 16)); }
console.log('scroll 2:', JSON.stringify(await p.evaluate(() => window.__gt3.probe())));
await new Promise((r) => setTimeout(r, 2500));
console.log('settled :', JSON.stringify(await p.evaluate(() => window.__gt3.probe())));
await b.close();
