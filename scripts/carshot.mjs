import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 180000,
  args: ['--enable-gpu','--use-gl=angle','--use-angle=metal','--enable-unsafe-swiftshader',
         '--hide-scrollbars','--no-sandbox','--user-data-dir=/tmp/gt3-chrome-profile','--no-first-run'],
  defaultViewport: { width: 1240, height: 1500 },
});
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[err]', e.message));
await page.goto('http://localhost:5173/carcheck.html', { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('window.__done === true', { timeout: 90000 });
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/carcheck.png' });
console.log('wrote /tmp/carcheck.png');
await browser.close();
