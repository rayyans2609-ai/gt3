// W4 browser-side helpers (served by Vite; imported only by scripts/p3u-w4-integrity.mjs).
// Deterministic pose, production-path pans (fixed dt) and in-page frame metrics, so only
// summaries, heatmaps and small crops cross the CDP boundary.
const M = {};
let ready = false;

export async function init() {
  if (ready) return;
  Object.assign(M, {
    drive: await import('/src/scroll/scrollDrive.js'), route: await import('/src/scene/trackCurve.js'),
    rig: await import('/src/scene/carRig.js'), cars: await import('/src/scene/cars.js'),
    morph: await import('/src/scene/morph.js'), aerial: await import('/src/scene/aerialCamera.js'),
    theme: await import('/src/scene/theme.js'), setup: await import('/src/scene/sceneSetup.js'),
    st: await import('/src/core/state.js'), finish: await import('/src/scene/finishLine.js'),
    env: await import('/src/scene/environment.js'), hud: await import('/src/ui/hud.js'),
  });
  for (let i = 0; i < 10; i++) M.cars.getCarModel(i).traverse(o => { o.userData.__w4Rotation = o.rotation.toArray(); });
  ready = true;
}

/** Same settled state as scripts/p3u-capture.mjs, at an arbitrary route t. */
export function pose({ car = 0, theme = 'day', t = 0.123 }) {
  const { drive, route, rig, cars, morph, aerial, setup, st } = M;
  drive.seekTo(route.progressAtRouteT(t), { instant: true });
  st.set('activeCarIndex', car); morph.resetMorph(car); rig.setWheels([]);
  M.theme.applyTheme(theme, { instant: true });
  cars.getCarModel(car).traverse(o => { if (o.userData.__w4Rotation) o.rotation.fromArray(o.userData.__w4Rotation); });
  rig.update(0); aerial.snap(); setup.updateScene(0); M.theme.update(0);
  M.finish.update(100); M.env.setParallax(0, 0);
  setup.camera.fov = aerial.TUNE.fov; setup.camera.updateProjectionMatrix();
  st.set('lapElapsedMs', 0); st.set('lapRunning', false); M.hud.update(0);
  const g = window.__gt3; g.passes.wash.uniforms.uTime.value = 0; g.passes.motionBlur.uniforms.uStrength.value = 0;
}

/** Advance the production frame path with a fixed dt at a constant drive speed. */
let pan = null;
export function panStart(s) {
  pose(s);
  const metresPerSecond = s.speed * 0.09 * 3472.646166835742; // scrollDrive velocityFullScale × TOUR_LENGTH
  pan = { p: M.st.state.progress, dp: (s.metresPerFrame ?? metresPerSecond / 60) / M.route.TOUR_LENGTH, speed: s.speed, k: 0 };
  return { metresPerFrame: pan.dp * M.route.TOUR_LENGTH };
}
export function panStep(s) {
  const { st, rig, aerial, setup } = M, dt = 1 / 60, g = window.__gt3;
  pan.k++; pan.p += pan.dp;
  st.set('progress', pan.p); st.set('velocity', pan.speed); st.set('speed01', pan.speed);
  rig.update(dt); aerial.update(dt); setup.updateScene(dt); M.theme.update(0);
  if (s.grain === 'frozen') g.passes.wash.uniforms.uTime.value = 0;
  if (s.blur === false) g.passes.motionBlur.uniforms.uStrength.value = 0;
  if (Number.isFinite(s.blurStrength)) g.passes.motionBlur.uniforms.uStrength.value = s.blurStrength;
}

let buffer = null, flipped = null;
/** Render once and read the drawing buffer (top-down RGBA8, backing resolution). */
export function renderRead() {
  const g = window.__gt3, r = g.renderer, gl = r.getContext(), w = r.domElement.width, h = r.domElement.height;
  g.composer.render(0);
  if (!buffer || buffer.length !== w * h * 4) { buffer = new Uint8Array(w * h * 4); flipped = new Uint8Array(w * h * 4); }
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
  for (let y = 0; y < h; y++) flipped.set(buffer.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return { w, h, data: flipped };
}

const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export function crop(frame, c) {
  const x0 = Math.round(c.x * frame.w), y0 = Math.round(c.y * frame.h), w = Math.round(c.w * frame.w), h = Math.round(c.h * frame.h);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(frame.data.subarray(((y0 + y) * frame.w + x0) * 4, ((y0 + y) * frame.w + x0 + w) * 4), y * w * 4);
  return { w, h, rgba: b64(out) };
}
export const full = frame => ({ w: frame.w, h: frame.h, rgba: b64(frame.data) });

/** Temporal metrics over a pan. Flicker = per-pixel luma reversal: consecutive frame
 * differences of opposite sign, both >= T codes. Smooth motion of band-limited content
 * changes a pixel monotonically over a few frames; aliased sub-pixel features pop on/off. */
let acc = null;
export function metricsReset(T = 8) { acc = { T, prev: null, prev2: null, heat: null, frames: [] }; }
export function metricsAdd(frame) {
  const n = frame.w * frame.h, Y = new Uint8Array(n), d = frame.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) Y[i] = (54 * d[j] + 183 * d[j + 1] + 19 * d[j + 2]) >> 8;
  if (!acc.heat) acc.heat = new Uint16Array(n);
  let flicker = 0, absDiff = 0, big = 0;
  if (acc.prev) for (let i = 0; i < n; i++) { const a = Y[i] - acc.prev[i]; absDiff += a < 0 ? -a : a; }
  if (acc.prev2) {
    const T = acc.T, p = acc.prev, q = acc.prev2;
    for (let i = 0; i < n; i++) {
      const d1 = p[i] - q[i], d2 = Y[i] - p[i];
      if ((d1 >= T && d2 <= -T) || (d1 <= -T && d2 >= T)) { flicker++; acc.heat[i]++; if (Math.min(Math.abs(d1), Math.abs(d2)) >= 3 * T) big++; }
    }
  }
  acc.frames.push({ flicker, flickerStrong: big, meanAbsDiff: acc.prev ? absDiff / n : null });
  acc.prev2 = acc.prev; acc.prev = Y;
}
/** Heatmap (hot = flicker count) over a dimmed copy of the given frame, RGBA. */
export function metricsResult(frame) {
  const n = frame.w * frame.h, out = new Uint8Array(n * 4); let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, acc.heat[i]);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = acc.heat[i], gray = ((54 * frame.data[j] + 183 * frame.data[j + 1] + 19 * frame.data[j + 2]) >> 8) * 0.35;
    const k = v ? Math.min(1, 0.35 + v / 6) : 0;
    out[j] = gray * (1 - k) + 255 * k; out[j + 1] = gray * (1 - k) + (v > 3 ? 230 : 40) * k; out[j + 2] = gray * (1 - k); out[j + 3] = 255;
  }
  const f = acc.frames.slice(2), total = f.reduce((s, x) => s + x.flicker, 0), strong = f.reduce((s, x) => s + x.flickerStrong, 0);
  let hotPixels = 0; for (let i = 0; i < n; i++) if (acc.heat[i]) hotPixels++;
  return { summary: { frames: acc.frames.length, threshold: acc.T, flickerEventsPerFramePerMP: total / f.length / (n / 1e6),
    strongEventsPerFramePerMP: strong / f.length / (n / 1e6), pixelsEverFlickeringFraction: hotPixels / n, maxCount: max, perFrame: acc.frames },
    heat: { w: frame.w, h: frame.h, rgba: b64(out) } };
}

/** Per-pixel range of the final image across several grain seeds at a frozen pose.
 * Grain + dither alone bound the range; larger excursions are grain-induced AA changes. */
export function grainRange(times) {
  const g = window.__gt3; let lo = null, hi = null, w, h;
  for (const t of times) {
    g.passes.wash.uniforms.uTime.value = t; const f = renderRead(); w = f.w; h = f.h;
    if (!lo) { lo = new Uint8Array(f.data); hi = new Uint8Array(f.data); }
    else for (let i = 0; i < f.data.length; i++) { const v = f.data[i]; if (v < lo[i]) lo[i] = v; if (v > hi[i]) hi[i] = v; }
  }
  g.passes.wash.uniforms.uTime.value = 0;
  const hist = new Uint32Array(256), heat = new Uint8Array(w * h * 4); let over = 0;
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    const r = Math.max(hi[i] - lo[i], hi[i + 1] - lo[i + 1], hi[i + 2] - lo[i + 2]); hist[r]++;
    if (r > 6) over++;
    heat[i] = r > 6 ? 255 : r * 20; heat[i + 1] = r > 6 ? 40 : r * 20; heat[i + 2] = r > 6 ? 40 : r * 20; heat[i + 3] = 255;
  }
  return { w, h, histogram: [...hist.slice(0, 64)], pixelsOver6: over, fractionOver6: over / (w * h), heat: { w, h, rgba: b64(heat) } };
}

/** Radial-blur sampling study at a frozen pose: production 8 taps vs a 64-tap reference
 * (same length, same weights' integral) vs 8 taps with a per-pixel interleaved-gradient
 * offset. Diagnostic only: the pass shader is swapped and restored here. */
export function blurStudy(strength, c) {
  const g = window.__gt3, m = g.passes.motionBlur.material, original = m.fragmentShader;
  const variant = body => original.replace(/vec4 color = vec4\(0\.0\);[\s\S]*gl_FragColor = color \* 0\.125;/, body);
  const shaders = {
    production: original,
    ref64: variant(`vec4 color = vec4(0.0);
      for (int i = 0; i < 64; i++) color += texture2D(tDiffuse, vUv + blurVector * (float(i) / 63.0));
      gl_FragColor = color / 64.0;`),
    jitter8: variant(`vec4 color = vec4(0.0);
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      for (int i = 0; i < 8; i++) color += texture2D(tDiffuse, vUv + blurVector * ((float(i) + n) / 8.0));
      gl_FragColor = color * 0.125;`),
  };
  const out = {}, frames = {};
  for (const [name, fs] of Object.entries(shaders)) {
    m.fragmentShader = fs; m.needsUpdate = true; g.passes.motionBlur.uniforms.uStrength.value = strength;
    const f = renderRead(); frames[name] = new Uint8Array(f.data); out[name] = { crop: crop(f, c) }; out.w = f.w; out.h = f.h;
  }
  m.fragmentShader = original; m.needsUpdate = true; g.passes.motionBlur.uniforms.uStrength.value = 0;
  for (const name of ['production', 'jitter8']) {
    let sum = 0, max = 0, over4 = 0; const a = frames[name], r = frames.ref64;
    for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - r[i]), Math.abs(a[i + 1] - r[i + 1]), Math.abs(a[i + 2] - r[i + 2])); sum += d; max = Math.max(max, d); if (d > 4) over4++; }
    out[name].errorVsRef64 = { meanMaxChannel: sum / (a.length / 4), max, fractionOver4: over4 / (a.length / 4) };
  }
  return out;
}
