import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox','--user-data-dir=/tmp/gt3-chrome-sc','--no-first-run',
         '--window-size=1600,900','--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`[PAGEERROR] ${e.message}`));
page.on('console', m => { if (m.type()==='error') errs.push(`[err] ${m.text()}`); });
const wait = ms => new Promise(r=>setTimeout(r,ms));

await page.goto('http://localhost:5173/', { waitUntil:'networkidle2', timeout:120000 });
await wait(11000);
await page.mouse.wheel({ deltaY: 240 });
await wait(2500);

// Drive just past the FIRST coin and let its montage finish.
await page.evaluate(()=>{const m=document.documentElement.scrollHeight-window.innerHeight;
  window.scrollTo({top:m*0.08,behavior:'instant'});});
await wait(3000);
for (let i=0;i<40;i++){
  const on = await page.evaluate(()=>!!document.querySelector('#montage-layer.is-active'));
  if(!on) break; await wait(1000);
}
await wait(2500);
console.log('--- MID-RACE: opening showcase ---');
await page.keyboard.press('f');
await wait(4000);
console.log(JSON.stringify(await page.evaluate(()=>{
  const card=document.querySelector('.showcase-card');
  const r=card?card.getBoundingClientRect():null;
  return {
    showcase: !!document.querySelector('#showcase-layer.is-open'),
    bodyClass: document.body.classList.contains('gt3-showcase-open'),
    hudOpacity: getComputedStyle(document.querySelector('#hud')).opacity,
    specOpacity: getComputedStyle(document.querySelector('#spec-panel')).opacity,
    todOpacity: getComputedStyle(document.querySelector('#tod-selector')).opacity,
    cardTop: r?Math.round(r.top):null,
    cardBottom: r?Math.round(r.bottom):null,
    cardFitsViewport: r? r.bottom <= window.innerHeight+1 : null,
    cardScrolls: card? card.scrollHeight > card.clientHeight+1 : null,
    achievementsReachable: !!document.querySelector('.showcase-achievements__item'),
    pageScrollbar: document.documentElement.scrollHeight > window.innerHeight,
  };
})));
await page.screenshot({ path:'/tmp/sc_midrace.png' });
await page.keyboard.press('Escape');
await wait(1500);
console.log('AFTER ESC:', JSON.stringify(await page.evaluate(()=>({
  bodyClass: document.body.classList.contains('gt3-showcase-open'),
  hudOpacity: getComputedStyle(document.querySelector('#hud')).opacity,
}))));
console.log('errors:', errs.length? [...new Set(errs)].join('\n') : 'none');
await browser.close();
