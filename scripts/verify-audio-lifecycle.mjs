/** Audio lifecycle verification. Run via with-verification-server.sh; GT3_URL selects the server. */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const hubVariant = process.argv.find(arg => arg.startsWith('--hub='))?.split('=')[1] || process.env.GT3_HUB;
if (hubVariant && !['a', 'b'].includes(hubVariant)) throw new Error('Expected --hub=a or --hub=b');
const withHub = value => {
  if (!hubVariant) return value;
  const next = new URL(value); next.searchParams.set('hub', hubVariant); return next.href;
};

const base = withHub(process.env.GT3_URL || 'http://127.0.0.1:5261');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { base, cases: {} };
const until = async (fn, label, ms = 90000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`timeout: ${label}`);
};

// Instrument the browser's real audio graph before application code runs. Buffers are tagged
// at fetch/decode; actual ended events, not scheduled stop calls, determine live source counts.
function instrument() {
  const fault = sessionStorage.getItem('audio-harness-fault');
  if (fault) window.__gt3TestFaults = JSON.parse(fault);
  let release;
  const held = sessionStorage.getItem('audio-harness-hold') === '1';
  const gate = new Promise(resolve => { release = resolve; });
  window.__audioRelease = () => release();
  const encoded = new WeakMap(), decoded = new WeakMap(), links = new WeakMap();
  const sources = [], contexts = [], media = [], gains = [], gainEvents = [];
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    if (held && /\/audios\/(coin|coin_approach|engine_start|finish|idle)\.mp3/.test(String(args[0]))) await gate;
    const response = await originalFetch(...args);
    const url = String(args[0]);
    if (/\/audios\//.test(url)) {
      const read = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => { const data = await read(); encoded.set(data, url.split('/').pop()); return data; };
    }
    return response;
  };
  const AC = window.AudioContext;
  const decode = AC.prototype.decodeAudioData;
  AC.prototype.decodeAudioData = function(data, ...args) {
    const name = encoded.get(data);
    const result = decode.call(this, data, ...args);
    if (name) result.then(buffer => decoded.set(buffer, name));
    return result;
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(dest, ...args) {
    const outputs = links.get(this) || []; outputs.push(dest); links.set(this, outputs);
    return connect.call(this, dest, ...args);
  };
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function(...args) { if (!args.length) links.delete(this); return disconnect.apply(this, args); };
  const create = AC.prototype.createBufferSource;
  const createGain = AC.prototype.createGain;
  AC.prototype.createGain = function() {
    const node = createGain.call(this), index = gains.length;
    gains.push(node);
    for (const method of ['setValueAtTime', 'linearRampToValueAtTime']) {
      const original = node.gain[method].bind(node.gain);
      node.gain[method] = (...args) => { gainEvents.push({ index, method, args, at: this.currentTime }); return original(...args); };
    }
    return node;
  };
  AC.prototype.createBufferSource = function() {
    const node = create.call(this), record = { node, name: null, started: false, ended: false, stopCalls: 0 };
    sources.push(record);
    const start = node.start.bind(node), stop = node.stop.bind(node);
    node.start = (...args) => { record.name = decoded.get(node.buffer) || 'unknown'; record.started = true; record.startedAt = performance.now(); return start(...args); };
    node.stop = (...args) => { record.stopCalls++; return stop(...args); };
    node.addEventListener('ended', () => { record.ended = true; });
    return node;
  };
  const mediaSource = AC.prototype.createMediaElementSource;
  AC.prototype.createMediaElementSource = function(element) { media.push(element); return mediaSource.call(this, element); };
  const Original = window.AudioContext;
  window.AudioContext = class extends Original { constructor(...args) { super(...args); contexts.push(this); } };
  function gain(node, seen = new Set()) {
    if (!node || seen.has(node)) return 0;
    seen.add(node);
    const own = node instanceof GainNode ? node.gain.value : 1;
    if (node instanceof AudioDestinationNode) return own;
    return own * Math.max(0, ...(links.get(node) || []).map(next => gain(next, new Set(seen))));
  }
  window.__audioProbe = () => ({
    contexts: contexts.map(c => c.state),
    sources: sources.filter(s => s.started).map(s => ({ name: s.name, loop: s.node.loop,
      live: !s.ended, stopCalls: s.stopCalls, gain: gain(s.node), rate: s.node.playbackRate.value, startedAt: s.startedAt })),
    media: media.map(m => ({ src: m.currentSrc, paused: m.paused, time: m.currentTime, ready: m.readyState })),
    buses: Object.fromEntries(['master', 'music', 'sfx', 'engine', 'voice'].map((name, i) => [name, gains[i] ? gain(gains[i]) : null])),
    gains: window.__gt3audio?.gains(),
    gainEvents,
  });
}

let browser;
try {
  const tmp = fileURLToPath(new URL('../local/tmp/', import.meta.url));
  mkdirSync(tmp, { recursive: true });
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${path.join(tmp, `gt3-audio-${process.pid}`)}`],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(instrument);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await until(() => page.evaluate(() => window.__gt3?.landing?.loaded() && ['ready', 'degraded'].includes(window.__gt3?.readiness?.status)), 'ready');
  const run = async (name, fn) => { try { report.cases[name] = { pass: true, ...(await fn()) }; } catch (e) { report.cases[name] = { pass: false, error: String(e), observed: await page.evaluate(() => window.__audioProbe()) }; } console.error(`${name}: ${report.cases[name].pass ? 'PASS' : 'FAIL'}`); };
  await run('1-landing-gesture', async () => {
    await page.click('.audio-speaker');
    await until(() => page.evaluate(async () => (await import('/src/core/state.js')).state.audioReady), 'audio ready');
    await wait(500);
    const observed = await page.evaluate(() => window.__audioProbe());
    assert.equal(observed.sources.length, 0, 'Landing started race sources');
    assert.ok(observed.media.some(m => !m.paused), 'music must play');
    return { observed };
  });
  const probe = () => page.evaluate(() => window.__audioProbe());
  const state = () => page.evaluate(async () => {
    const s = (await import('/src/core/state.js')).state;
    return { experience: s.experience, transition: s.transition, audioReady: s.audioReady,
      masterMuted: s.masterMuted, musicMuted: s.musicMuted };
  });
  const experience = async name => until(async () => {
    const s = await state(); return s.experience === name && !s.transition && s;
  }, name);
  const hub = async () => { await page.evaluate(() => window.__gt3.landing.seek(1)); await experience('hub'); await wait(500); };
  const tour = async () => { await page.click('.hub-start'); await experience('tour'); await wait(300); };
  const home = async () => { await page.click('.home-control'); await experience('hub'); await wait(300); };
  const started = (p, name) => p.sources.filter(s => s.name === name);
  const live = (p, name) => started(p, name).filter(s => s.live);
  const noRace = p => assert.equal(p.sources.filter(s => s.live).length, 0, 'race source still live');
  const ready = () => until(() => page.evaluate(() => window.__gt3 && ['ready', 'degraded'].includes(window.__gt3.readiness?.status)), 'app ready');
  const reload = async () => { await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await ready(); };
  const activate = async () => { await page.click('.audio-speaker'); await until(async () => (await state()).audioReady, 'audio ready'); await wait(350); };
  // Route persistence flushes on pagehide; reset after that flush, before the next document.
  const reset = async entries => {
    await page.evaluate(values => window.addEventListener('pagehide', () => {
      sessionStorage.clear();
      for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value);
    }, { once: true }), entries);
    await reload();
  };
  const clean = () => reset({});

  await run('3-active-enter-tour', async () => {
    await hub(); const before = await probe(); await tour(); const p = await probe();
    assert.equal(started(p, 'engine_start.mp3').length - started(before, 'engine_start.mp3').length, 1, 'Tour entry did not start a new engine sound');
    assert.equal(live(p, 'idle.mp3').length, 1);
    await wait(3100); const settled = await probe();
    // Phase 5 mix (audioManager MIX.idle, measured 2026-11-04): idle settles at 0.26, was 0.15.
    assert.ok(Math.abs(live(settled, 'idle.mp3')[0].gain - 0.26) < 0.02, 'idle gain did not settle');
    assert.ok(Math.abs(live(settled, 'idle.mp3')[0].rate - 1) < 0.03, 'stationary idle rate');
    return { before, observed: p, settled };
  });
  await run('5-tour-to-hub-music-continuity', async () => {
    await wait(1200); const before = await probe(); await home(); await wait(1200); const after = await probe();
    noRace(after); assert.ok(!before.media[0].paused && !after.media[0].paused);
    assert.equal(after.media[0].src, before.media[0].src);
    assert.ok(after.media[0].time > before.media[0].time, 'music position did not advance');
    return { before, after };
  });
  await run('6-repeated-reentry', async () => {
    const observations = [];
    for (let i = 0; i < 3; i++) {
      await tour(); let p = await probe(); assert.equal(live(p, 'idle.mp3').length, 1);
      assert.ok(live(p, 'engine_start.mp3').length <= 1); observations.push({ tour: p });
      await home(); p = await probe(); noRace(p); observations[i].hub = p;
    }
    return { observations };
  });
  await run('7-independent-mutes', async () => {
    await page.evaluate(async () => (await import('/src/audio/audioManager.js')).setMusicMuted(true));
    await page.click('.audio-speaker'); await wait(300); const muted = await probe();
    assert.ok(muted.gains.master < 0.02 && muted.gains.musicMute < 0.02);
    await tour(); await home(); await page.click('.audio-speaker'); await wait(300);
    const hubUnmuted = await probe(); noRace(hubUnmuted);
    assert.ok(hubUnmuted.gains.master > 0.98 && hubUnmuted.gains.musicMute < 0.02);
    await page.evaluate(async () => (await import('/src/audio/audioManager.js')).setMusicMuted(false));
    await wait(300); const allUnmuted = await probe(); assert.ok(allUnmuted.gains.musicMute > 0.98); noRace(allUnmuted);
    return { muted, hubUnmuted, allUnmuted };
  });
  await run('2-hub-gesture', async () => {
    await clean(); await hub(); await activate(); const p = await probe(); noRace(p);
    assert.equal(p.sources.length, 0); assert.ok(p.media.some(m => !m.paused)); return { observed: p };
  });
  await run('4-tour-gesture', async () => {
    await clean(); await hub(); await tour(); assert.equal((await state()).audioReady, false);
    await activate(); const p = await probe(); assert.equal(started(p, 'engine_start.mp3').length, 1);
    assert.equal(live(p, 'idle.mp3').length, 1); assert.ok(p.media.some(m => !m.paused)); return { observed: p };
  });
  await run('8-refresh-tour-hub-landing', async () => {
    const observations = {};
    for (const name of ['tour', 'hub', 'landing']) {
      if (name === 'hub') await home();
      if (name === 'landing') { await page.evaluate(() => window.__gt3.landing.seek(0)); await experience('landing'); }
      await reload(); await experience(name); const before = await probe();
      assert.equal((await state()).audioReady, false); assert.equal(before.sources.length, 0); assert.equal(before.media.length, 0);
      await activate(); const after = await probe();
      if (name === 'tour') assert.equal(live(after, 'idle.mp3').length, 1); else noRace(after);
      observations[name] = { before, after };
    }
    return { observations };
  });
  await run('9-rapid-and-cancel', async () => {
    await hub();
    await page.evaluate(async () => { const e = await import('/src/core/experience.js'); e.beginTransition('tour'); e.cancelTransition(); });
    const cancelled = await probe(); noRace(cancelled);
    await page.evaluate(() => { document.querySelector('.hub-start').click(); document.querySelector('.home-control').click(); document.querySelector('.hub-start').click(); });
    await experience('tour'); const entered = await probe(); assert.equal(live(entered, 'idle.mp3').length, 1);
    await home(); const returned = await probe(); noRace(returned); return { cancelled, entered, returned };
  });
  await run('10-race-effects-and-showcase-voice', async () => {
    await page.evaluate(async () => { const a = await import('/src/audio/audioManager.js'); a.playCheckpointCross(); a.setCoinApproach(1); a.playFinish(); a.onMontageStart(0); });
    await wait(200); const dormant = await probe(); noRace(dormant);
    await tour();
    const checkpointAt = await page.evaluate(async () => { const a = await import('/src/audio/audioManager.js'); const at = performance.now(); a.playCheckpointCross(); a.setCoinApproach(1); return at; });
    await wait(150); const approach = await probe();
    assert.ok(started(approach, 'checkpoint.mp3').length && live(approach, 'coin_approach.mp3').length);
    const finishAt = await page.evaluate(async () => { const a = await import('/src/audio/audioManager.js'); const at = performance.now(); a.playFinish(); return at; });
    await wait(150); const active = await probe();
    assert.ok(started(active, 'finish.mp3').length);
    assert.ok(started(active, 'checkpoint.mp3').at(-1).startedAt - checkpointAt < 100);
    assert.ok(started(active, 'finish.mp3').at(-1).startedAt - finishAt < 100);
    await home(); const stopped = await probe(); noRace(stopped);
    const voice = await page.evaluate(async () => { const a = await import('/src/audio/audioManager.js'); const ok = await a.playVoice(0); a.pauseVoice(); const resumed = await a.resumeVoice(); a.stopVoice(); return { ok, resumed }; });
    assert.ok(voice.ok && voice.resumed, 'voice play/pause/resume failed');
    return { dormant, checkpointAt, approach, finishAt, active, stopped, voice, afterVoice: await probe() };
  });
  await run('9b-delayed-preload-after-return', async () => {
    await reset({ 'audio-harness-fault': JSON.stringify({ audioHang: true, audioTimeoutMs: 1200 }), 'audio-harness-hold': '1' });
    await hub(); await page.click('.audio-speaker');
    assert.equal((await state()).audioReady, false);
    await tour(); await home();
    await page.evaluate(() => window.__audioRelease());
    await until(async () => (await state()).audioReady, 'delayed audio completion'); await wait(300);
    const p = await probe(); noRace(p); assert.equal(p.sources.length, 0);
    return { observed: p, readiness: await page.evaluate(() => window.__gt3.readiness) };
  });
  await run('9c-preload-rejection-recovery', async () => {
    await reset({ 'audio-harness-fault': JSON.stringify({ audioReject: true }) });
    await hub(); await activate(); const p = await probe(); noRace(p);
    assert.equal(p.sources.length, 0); assert.ok(p.media.some(m => !m.paused));
    return { observed: p, readiness: await page.evaluate(() => window.__gt3.readiness) };
  });
  report.pass = Object.values(report.cases).every(c => c.pass);
} catch (error) { report.pass = false; report.fatal = String(error); }
finally { await browser?.close().catch(() => {}); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.pass ? 0 : 1; }
