import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new',
  args:['--no-sandbox','--user-data-dir=/tmp/gt3-chrome-shot','--no-first-run','--enable-unsafe-swiftshader'],
  defaultViewport:{width:1600,height:900}});
const p = await b.newPage();
await p.goto('http://localhost:5173/',{waitUntil:'networkidle2',timeout:120000});
await new Promise(r=>setTimeout(r,11000));
await p.screenshot({path:'/tmp/apron_start.png'});
// nudge forward slightly so the start-line apron is behind the car
await p.mouse.wheel({deltaY:200}); await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:'/tmp/apron_after.png'});
await b.close(); console.log('done');
