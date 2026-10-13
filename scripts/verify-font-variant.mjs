/** ?font=sw typography variant: flag, Switzer load, roles, mono unchanged, query combination,
 * ten-car HUD fit and captures. Run through the heavy gate with a fresh owned server.
 */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = (process.env.GT3_URL || 'http://127.0.0.1:5201').replace(/\/$/, '');
const out = process.env.GT3_OUT || '/tmp/gt3-font-variant';
await mkdir(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = { source: process.env.GT3_SOURCE, base, variants: {}, errors: [] };
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
try {
  for (const [name, query] of [['default', ''], ['switzer', '?font=sw'], ['switzer-p2', '?font=sw&grid=p2']]) {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const firstPaintFlag = await page.evaluate(() => document.documentElement.dataset.font || null);
    await page.waitForFunction(() => ['ready', 'degraded'].includes(window.__gt3?.readiness?.status), { timeout: 180000 });
    await page.evaluate(() => document.fonts.ready); await wait(800);
    await page.screenshot({ path: `${out}/${name}-start.png` });
    await page.mouse.wheel({ deltaY: 120 }); await wait(1800);
    const fit = [];
    for (let car = 0; car < 10; car++) {
      await page.evaluate(async i => (await import('/src/core/state.js')).set('activeCarIndex', i), car); await wait(700);
      fit.push(await page.evaluate(() => {
        const slot = document.querySelector('.hud-identity__slot.is-visible') || document;
        const q = s => slot.querySelector(s);
        const over = el => el ? { w: el.scrollWidth > el.clientWidth + 1, h: el.scrollHeight > el.clientHeight + 1, text: el.textContent } : null;
        return { name: over(q('.hud-identity__name')), headline: over(q('.hud-identity__headline')), spec: over(q('.hud-identity__spec')) };
      }));
      if (car === 0) await page.screenshot({ path: `${out}/${name}-hud.png` });
    }
    const facts = await page.evaluate(async () => {
      const r = await import('/src/scene/trackCurve.js');
      const cs = s => { const el = document.querySelector(s); return el ? getComputedStyle(el) : null; };
      return {
        flag: document.documentElement.dataset.font || null,
        switzerLoaded: document.fonts.check('600 23px Switzer'),
        switzerFaces: [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Switzer').map(f => `${f.style}:${f.status}`),
        nameFont: cs('.hud-identity__name')?.fontFamily, specFont: cs('.hud-identity__spec')?.fontFamily,
        timerFont: cs('.hud-lap-timer')?.fontFamily, displayToken: getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim(),
        gridSlot: r.GRID_SLOT, gridLateral: r.GRID_LATERAL,
      };
    });
    const sw = name !== 'default';
    assert.equal(firstPaintFlag, sw ? 'sw' : null, `${name}: flag not set before first paint`);
    assert.equal(facts.flag, sw ? 'sw' : null);
    assert(sw ? /^'?"?Switzer/.test(facts.nameFont) && /^'?"?Switzer/.test(facts.specFont) : /Neue Haas/.test(facts.nameFont), `${name}: wrong identity font ${facts.nameFont}`);
    assert(/Geist Mono/.test(facts.timerFont), `${name}: monospace changed ${facts.timerFont}`);
    if (sw) assert(facts.switzerLoaded && facts.switzerFaces.some(f => f.endsWith(':loaded')), `${name}: Switzer not loaded ${facts.switzerFaces}`);
    else assert(!facts.switzerFaces.some(f => f.endsWith(':loaded')), 'default fetched Switzer');
    assert.equal(facts.gridSlot, name === 'switzer-p2' ? 'p2' : 'p1');
    assert.equal(errors.length, 0, `${name}: ${errors.join(' | ')}`);
    report.variants[name] = { query, firstPaintFlag, facts, fit, overflow: fit.filter(f => Object.values(f).some(v => v && (v.w || v.h))).length };
    await page.close();
  }
  report.pass = true; console.log('PASS font variant', JSON.stringify(Object.fromEntries(Object.entries(report.variants).map(([k, v]) => [k, { font: v.facts.nameFont, overflowCars: v.overflow }]))));
} catch (error) {
  report.pass = false; report.failure = error.stack; console.error(error.stack); process.exitCode = 1;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); await browser.close();
}
