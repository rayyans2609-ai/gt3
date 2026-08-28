import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-tq', '--no-first-run'],
  defaultViewport: { width: 400, height: 300 } });
const p = await b.newPage();
await p.goto('about:blank');
console.log(JSON.stringify(await p.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const exts = gl.getSupportedExtensions();
  return { timer2: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
           timer1: !!gl.getExtension('EXT_disjoint_timer_query'),
           has: exts.filter((e) => /timer|disjoint/i.test(e)) };
})));
await b.close();
