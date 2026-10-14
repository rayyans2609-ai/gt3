/** Browser verification for W5a edge-row controls.
 * Usage: node scripts/verify-controls.mjs [baseUrl] [outDir]
 * Defaults: baseUrl http://127.0.0.1:5196/ — outDir /Users/rayyansheikh/Desktop/gt3-review-2026-10-04/w5a/
 * Modelled on scripts/verify-checkpoints.mjs: puppeteer-core, same Chrome launch
 * settings, 1600x900, waits for readiness, dismisses the start screen with real
 * wheel input. Prints a JSON summary and exits non-zero if any check fails. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:5196/';
const outDir = process.argv[3] || '/Users/rayyansheikh/Desktop/gt3-review-2026-10-04/w5a/';
const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
await mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run',
    ...(softwareGL ? ['--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
      : ['--enable-gpu', '--use-gl=angle', '--use-angle=metal']),
    `--user-data-dir=/tmp/gt3-w5a/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const phases = [];
const recordPhase = async (name, work) => {
  try {
    const value = await work();
    phases.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    phases.push({ name, status: 'FAIL', message });
    console.error(`FAIL ${name}: ${message}`);
    return undefined;
  }
};
const report = { base, outDir, renderer: softwareGL ? 'SwiftShader fallback' : 'ANGLE/Metal', phases, errors };
const shots = [];

async function rects() {
  return page.evaluate(() => {
    const player = document.querySelector('.music-player');
    const hud = document.querySelector('#hud-bottomright');
    const launcher = document.querySelector('.audio-launcher');
    const box = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const opacity = selector => {
      const element = document.querySelector(selector);
      return element ? Number.parseFloat(getComputedStyle(element).opacity) : null;
    };
    return {
      player: box(player),
      hud: box(hud),
      playerVisible: player ? getComputedStyle(player).visibility !== 'hidden' : false,
      layerOpen: document.querySelector('#audio-layer')?.classList.contains('is-open') ?? false,
      bodyParked: document.body.classList.contains('is-player-open'),
      expanded: launcher?.getAttribute('aria-expanded'),
      label: launcher?.getAttribute('aria-label'),
      plusOpacity: opacity('.audio-launcher .glyph-plus'),
      closeOpacity: opacity('.audio-launcher .glyph-close'),
      theme: document.documentElement.dataset.theme,
      playerW: getComputedStyle(document.documentElement).getPropertyValue('--player-w').trim(),
    };
  });
}

function intersects(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function sampleTransition(label) {
  const hits = [];
  for (let i = 0; i < 10; i++) {
    const state = await rects();
    if (state.playerVisible && intersects(state.player, state.hud)) {
      hits.push({ sample: i, player: state.player, hud: state.hud });
    }
    await wait(60);
  }
  assert(hits.length === 0, `${label}: player/hud overlap in ${hits.length} samples: ${JSON.stringify(hits[0])}`);
  return true;
}

async function cornerShot(name) {
  const path = `${outDir}/${name}`;
  await page.screenshot({ path, clip: { x: 1100, y: 500, width: 500, height: 400 } });
  shots.push(path);
  return path;
}

try {
  const ready = await recordPhase('startup', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gt3?.readiness
      && (window.__gt3.readiness.status === 'ready' || window.__gt3.readiness.status === 'degraded'),
      { timeout: 180000 });
    await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-rig')
      && document.querySelector('#start-screen.is-ready'), { timeout: 120000 });
    // Dismiss the start screen the same way verify-checkpoints does: real wheel input.
    await page.mouse.wheel({ deltaY: 240 });
    await wait(1600);
    const state = await rects();
    assert(state.theme === 'day' || state.theme === 'night', 'no theme dataset after startup');
    assert(state.player && state.hud, 'audio player or #hud-bottomright missing');
    assert(!state.layerOpen && state.expanded === 'false', 'player should start collapsed');
    report.readiness = await page.evaluate(() => window.__gt3.readiness.status);
    return true;
  });
  if (ready) {
    await recordPhase('launcher glyph', async () => {
      const closed = await rects();
      assert(closed.expanded === 'false', `closed aria-expanded=${closed.expanded}`);
      assert(closed.label === 'Open music player', `closed aria-label=${closed.label}`);
      assert((closed.plusOpacity ?? 0) > 0.9, `closed plus opacity=${closed.plusOpacity}`);
      assert((closed.closeOpacity ?? 1) < 0.1, `closed close opacity=${closed.closeOpacity}`);
      await page.click('.audio-launcher');
      await page.waitForFunction(() => document.querySelector('#audio-layer')?.classList.contains('is-open'), { timeout: 5000 });
      // CSS transitions only advance with painted frames; poll for the settled glyph instead of a fixed sleep.
      await page.waitForFunction(() => Number.parseFloat(getComputedStyle(
        document.querySelector('.audio-launcher .glyph-close')).opacity) > 0.9, { timeout: 4000, polling: 50 }).catch(() => {});
      const open = await rects();
      assert(open.expanded === 'true', `open aria-expanded=${open.expanded}`);
      assert(open.label === 'Close music player', `open aria-label=${open.label}`);
      assert((open.closeOpacity ?? 0) > 0.9, `open close opacity=${open.closeOpacity}`);
      assert((open.plusOpacity ?? 1) < 0.1, `open plus opacity=${open.plusOpacity}`);
      // Return to collapsed for the recomposition phase baseline.
      await page.click('.audio-launcher');
      await page.waitForFunction(() => !document.querySelector('#audio-layer')?.classList.contains('is-open'), { timeout: 5000 });
      await wait(450);
    });

    await recordPhase('edge-row recomposition', async () => {
      const before = await rects();
      assert(!before.layerOpen, 'player should be collapsed at recomposition baseline');
      const closedRight = 1600 - before.hud.right;
      await page.click('.audio-launcher');
      await sampleTransition('open');
      await wait(300);
      const open = await rects();
      assert(open.layerOpen && open.bodyParked, 'body.is-player-open not set while open');
      assert(!intersects(open.player, open.hud),
        `open overlap: player ${JSON.stringify(open.player)} hud ${JSON.stringify(open.hud)}`);
      // Parked one gap beyond the player's real outer edge: right = 24 + playerW + gap.
      const playerW = open.player.width;
      const openRight = 1600 - open.hud.right;
      const expected = 24 + playerW + 12;
      assert(Math.abs(openRight - expected) <= 4,
        `parked right ${openRight.toFixed(1)} != 24 + ${playerW.toFixed(1)} + 12; --player-w=${open.playerW}`);
      assert(openRight > closedRight + 100, `hud did not move outward: ${closedRight} -> ${openRight}`);
      await page.click('.audio-launcher');
      await sampleTransition('close');
      await page.waitForFunction(() => !document.querySelector('#audio-layer')?.classList.contains('is-open'), { timeout: 5000 });
      await wait(450);
      const after = await rects();
      const afterRight = 1600 - after.hud.right;
      assert(Math.abs(afterRight - closedRight) <= 2,
        `hud did not return: was ${closedRight.toFixed(1)}, now ${afterRight.toFixed(1)}`);
    });

    await recordPhase('day/night segmented toggle', async () => {
      const day = '.theme-segmented [role="radio"][aria-label="Day"]';
      const night = '.theme-segmented [role="radio"][aria-label="Night"]';
      const groupRole = await page.evaluate(() =>
        document.querySelector('.theme-segmented')?.getAttribute('role'));
      assert(groupRole === 'radiogroup', `container role=${groupRole}`);
      await page.click(night);
      await wait(250);
      let theme = await page.evaluate(() => ({ t: document.documentElement.dataset.theme,
        night: document.querySelector('.theme-segmented [role="radio"][aria-label="Night"]')?.getAttribute('aria-checked'),
        day: document.querySelector('.theme-segmented [role="radio"][aria-label="Day"]')?.getAttribute('aria-checked') }));
      assert(theme.t === 'night', `click moon -> theme=${theme.t}`);
      assert(theme.night === 'true' && theme.day === 'false',
        `aria-checked after moon: day=${theme.day} night=${theme.night}`);
      // Clicking the active side is a no-op (still night, no error).
      await page.click(night);
      await wait(150);
      theme = await page.evaluate(() => document.documentElement.dataset.theme);
      assert(theme === 'night', 're-clicking moon changed theme');
      await page.click(day);
      await wait(250);
      theme = await page.evaluate(() => ({ t: document.documentElement.dataset.theme,
        night: document.querySelector('.theme-segmented [role="radio"][aria-label="Night"]')?.getAttribute('aria-checked'),
        day: document.querySelector('.theme-segmented [role="radio"][aria-label="Day"]')?.getAttribute('aria-checked') }));
      assert(theme.t === 'day', `click sun -> theme=${theme.t}`);
      assert(theme.day === 'true' && theme.night === 'false',
        `aria-checked after sun: day=${theme.day} night=${theme.night}`);
    });

    await recordPhase('arrow-key selection', async () => {
      const day = '.theme-segmented [role="radio"][aria-label="Day"]';
      const night = '.theme-segmented [role="radio"][aria-label="Night"]';
      await page.focus(day);
      await page.keyboard.press('ArrowRight');
      await wait(250);
      let theme = await page.evaluate(() => ({ t: document.documentElement.dataset.theme,
        active: document.activeElement?.getAttribute('aria-label') }));
      assert(theme.t === 'night', `ArrowRight -> theme=${theme.t}`);
      assert(theme.active === 'Night', `ArrowRight focus=${theme.active}`);
      await page.keyboard.press('ArrowLeft');
      await wait(250);
      theme = await page.evaluate(() => ({ t: document.documentElement.dataset.theme,
        active: document.activeElement?.getAttribute('aria-label') }));
      assert(theme.t === 'day', `ArrowLeft -> theme=${theme.t}`);
      assert(theme.active === 'Day', `ArrowLeft focus=${theme.active}`);
      const ring = await page.evaluate(() => {
        const element = document.querySelector('.theme-segmented [role="radio"][aria-label="Day"]');
        const style = getComputedStyle(element);
        return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
      });
      // Informational only: :focus-visible matching varies by modality heuristics,
      // so record the focused ring rather than hard-failing on it.
      report.focusRing = ring;
    });

    await recordPhase('corner screenshots', async () => {
      const isOpen = async () => page.evaluate(() =>
        document.querySelector('#audio-layer')?.classList.contains('is-open'));
      const ensure = async (wantOpen) => {
        if (await isOpen() !== wantOpen) {
          await page.click('.audio-launcher');
          await wait(500);
        }
      };
      const setTheme = async (name) => {
        const current = await page.evaluate(() => document.documentElement.dataset.theme);
        if (current !== name) {
          await ensure(false);
          await page.click(`.theme-segmented [role="radio"][aria-label="${name === 'day' ? 'Day' : 'Night'}"]`);
          await wait(400);
        }
      };
      await setTheme('day');
      await ensure(false);
      await wait(400);
      await cornerShot('day-closed.png');
      await ensure(true);
      await cornerShot('day-open.png');
      await setTheme('night');
      await ensure(false);
      await wait(400);
      await cornerShot('night-closed.png');
      await ensure(true);
      await cornerShot('night-open.png');
      await ensure(false);
      // Theme clicks happen with the player closed (a click outside #audio-layer
      // collapses it), so day-open/night-open shots above re-open after them.
      report.dayNightNote = 'theme clicks issued while collapsed; open shots re-opened after each theme set';
    });

    await recordPhase('console errors', async () => {
      assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
    });
  }
  report.shots = shots;
} finally {
  report.errors = errors;
  report.failed = phases.filter(phase => phase.status === 'FAIL').length;
  await writeFile(`${outDir}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.failed) process.exitCode = 1;
}
