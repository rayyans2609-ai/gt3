import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 180000,
  args: ['--enable-gpu','--use-gl=angle','--use-angle=metal','--enable-unsafe-swiftshader',
         '--hide-scrollbars','--no-sandbox','--user-data-dir=/tmp/gt3-chrome-profile','--no-first-run'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}\n${(e.stack||'').split('\n').slice(0,4).join('\n')}`));
page.on('requestfailed', r => logs.push(`[404] ${r.url()}`));
await page.goto('http://localhost:5173/#debug', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, 9000));
const info = await page.evaluate(() => {
  const g = window.__gt3; if (!g) return { err: 'no __gt3' };
  let coinGroup = null, carMount = null;
  g.scene.traverse(o => { if (o.name === 'coins' || o.name?.includes('coin')) coinGroup = coinGroup || o;
                          if (o.name === 'car-mount') carMount = o; });
  return {
    sceneChildren: g.scene.children.map(c => `${c.name || c.type}(${c.children.length})`),
    coinFound: coinGroup ? `${coinGroup.name} children=${coinGroup.children.length} visible=${coinGroup.visible}` : 'NONE',
    carMountChildren: carMount ? carMount.children.length : 'no mount',
  };
});
console.log(JSON.stringify(info, null, 1));
console.log('--- logs ---');
console.log(logs.filter(l => !/vite|Download the React/.test(l)).slice(0, 40).join('\n'));
await browser.close();
