/** One cold environment build in a disposable browser; GT3_URL selects checkout. */
import puppeteer from 'puppeteer-core';

const base = process.env.GT3_URL || 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', `--user-data-dir=/tmp/gt3-build-${process.pid}`,
    '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.setRequestInterception(true);
page.on('request', async (request) => {
  if (new URL(request.url()).pathname !== '/src/scene/environment.js') {
    await request.continue();
    return;
  }
  let source = await (await fetch(request.url())).text();
  if (!source.includes('export function buildEnvironment() {')
    || !source.includes('  return root;\n}')) {
    throw new Error('Environment instrumentation markers not found');
  }
  source = source.replace('export function buildEnvironment() {',
    'export function buildEnvironment() { const started = performance.now();');
  const lastReturn = source.lastIndexOf('  return root;\n}');
  source = source.slice(0, lastReturn)
    + '  window.__gt3EnvironmentBuildMs = performance.now() - started;\n'
    + source.slice(lastReturn);
  await request.respond({ status: 200, contentType: 'application/javascript', body: source });
});
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => Number.isFinite(window.__gt3EnvironmentBuildMs),
  { timeout: 180000 });
console.log(JSON.stringify({ base, buildMs: await page.evaluate(() => window.__gt3EnvironmentBuildMs),
  errors }));
await browser.close();
