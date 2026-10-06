/** SPEC §15 hero-car pivot check. For each composition (hero scale 1 / a 1.7 / b 1.9 / c 1.8), every roster car and
 * several route positions: the lowest wheel vertex per wheel quadrant is compared to the REAL asphalt triangle under
 * it (vertical ray against the 'track-asphalt' mesh), with body roll and idle bob removed (pivot error only; bob and
 * roll amplitudes are reported separately). Also records world scale per axis of the car root and wheel meshes
 * (uniform = single scalar). Usage: GT3_URL=http://127.0.0.1:5194 GT3_OUT=<dir> node scripts/verify-hero-pivot.mjs
 * Run the host preflight first; one browser, one page at a time. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = (process.env.GT3_URL || 'http://127.0.0.1:5194').replace(/\/$/, '');
const out = process.env.GT3_OUT || '/tmp/gt3-hero-pivot';
const looks = process.env.GT3_LOOKS?.split(',');
const comps = looks || (process.env.GT3_COMPS || ',a,b,c').split(',');
const ts = (process.env.GT3_TS || '0.02,0.1,0.25,0.4,0.55,0.7,0.85,0.97').split(',').map(Number);
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
process.once('SIGTERM', async () => { await browser.close(); process.exit(143); });

async function measure(page, ts) {
  return page.evaluate(async (ts) => {
    const carRig = await import('/src/scene/carRig.js');
    const cars = await import('/src/scene/cars.js');
    const { state } = await import('/src/core/state.js');
    const { COMP } = await import('/src/scene/composition.js');
    const scene = window.__gt3.scene;
    const asphalt = scene.getObjectByName('track-asphalt');
    const curbs = scene.getObjectByName('track-curbs');
    // Read the two existing mesh buffers directly. Importing an untransformed
    // examples utility from /node_modules would leave its bare 'three' unresolved.
    const asphaltPos = (COMP.look ? asphalt.geometry.toNonIndexed() : asphalt.geometry).getAttribute('position');
    const curbPos = curbs.geometry.getAttribute('position');
    const combined = COMP.look ? new Float32Array(asphaltPos.array.length + curbPos.array.length) : null;
    if (combined) { combined.set(asphaltPos.array); combined.set(curbPos.array, asphaltPos.array.length); }
    const pos = combined ? new asphaltPos.constructor(combined, 3) : asphaltPos;
    const index = COMP.look ? null : asphalt.geometry.index;
    asphalt.updateWorldMatrix(true, false);
    const aw = asphalt.matrixWorld.elements;
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].every((v, i) => Math.abs(v - aw[i]) < 1e-9);
    const triCount = index ? index.count / 3 : pos.count / 3;
    const asphaltTriCount = asphalt.geometry.index ? asphalt.geometry.index.count / 3 : asphalt.geometry.getAttribute('position').count / 3;
    const tri = i => index ? [index.getX(3 * i), index.getX(3 * i + 1), index.getX(3 * i + 2)] : [3 * i, 3 * i + 1, 3 * i + 2];
    // Road surface height under (x, z): vertical ray vs triangles (xz barycentric), nearest-in-y to `hint`.
    const triBox = new Float32Array(triCount * 4);
    const surfaceCells = new Map(), cellSize = 10;
    for (let i = 0; i < triCount; i++) {
      const [a, b, c] = tri(i);
      const xs = [pos.getX(a), pos.getX(b), pos.getX(c)], zs = [pos.getZ(a), pos.getZ(b), pos.getZ(c)];
      triBox.set([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], 4 * i);
      for (let x = Math.floor(triBox[4 * i] / cellSize); x <= Math.floor(triBox[4 * i + 1] / cellSize); x++)
        for (let z = Math.floor(triBox[4 * i + 2] / cellSize); z <= Math.floor(triBox[4 * i + 3] / cellSize); z++) {
          const key = `${x},${z}`;
          if (!surfaceCells.has(key)) surfaceCells.set(key, []);
          surfaceCells.get(key).push(i);
        }
    }
    function roadY(x, z, hint) {
      let best = null;
      for (const i of surfaceCells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) || []) {
        if (x < triBox[4 * i] || x > triBox[4 * i + 1] || z < triBox[4 * i + 2] || z > triBox[4 * i + 3]) continue;
        const [a, b, c] = tri(i);
        const ax = pos.getX(a), az = pos.getZ(a), bx = pos.getX(b), bz = pos.getZ(b), cx = pos.getX(c), cz = pos.getZ(c);
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const y = l1 * pos.getY(a) + l2 * pos.getY(b) + l3 * pos.getY(c);
        if (best === null || Math.abs(y - hint) < Math.abs(best.y - hint)) best = { y, curb: COMP.look && i >= asphaltTriCount };
      }
      return best;
    }
    const rig = carRig.rig, mount = carRig.carMount;
    const V3 = rig.position.constructor;
    const M4 = mount.matrixWorld.constructor;
    const hero = COMP.hero;
    const results = [];
    for (let carIndex = 0; carIndex < 10; carIndex++) {
      const model = cars.getCarModel(carIndex);
      if (!model) { results.push({ carIndex, error: 'no model' }); continue; }
      carRig.setCarModel(model);
      // cars.findWheels() only matches meshes whose OWN name looks like a wheel; these GLBs name the wheel nodes
      // (WHEEL_LF_.., TYRE_LF_..) and leave the meshes as Object_NN, so it returns 0 (reported as appFindWheels).
      // Measurement therefore collects meshes with a wheel-named ANCESTOR (same name filters as cars.js).
      const appFindWheels = cars.findWheels(model).length;
      const wheels = [];
      model.traverse(o => {
        if (!o.isMesh) return;
        const isWheelName = s => /wheel|tyre|tire|rim/i.test(s || '') && !/brake|caliper|disc|rotor|arch|well|steering/i.test(s || '');
        for (let a = o; a && a !== model.parent; a = a.parent) {
          if (isWheelName(a.name)) { wheels.push(o); return; }
        }
        // Merged-geometry models (ferrari/aston/lamborghini) only carry the wheel/tyre identity in material names.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some(m => isWheelName(m?.name))) wheels.push(o);
      });
      carRig.setWheels(cars.findWheels(model));
      for (const t of ts) {
        state.progress = t; state.targetProgress = t; state.speed01 = 0; state.velocity = 0;
        carRig.update(0);
        mount.rotation.set(0, 0, 0); mount.position.set(0, 0, 0); // pivot error only
        rig.updateMatrixWorld(true);
        const right = new V3(1, 0, 0).transformDirection(rig.matrixWorld);
        const fwd = new V3(0, 0, -1).transformDirection(rig.matrixWorld);
        const lowest = {}; // quadrant -> {y, x, z}
        const tread = {};
        let minAll = Infinity;
        const v = new V3(), im = new M4(), wm = new M4();
        for (const w of wheels) {
          const p = w.geometry.getAttribute('position');
          const n = w.isInstancedMesh ? w.count : 1;
          for (let k = 0; k < n; k++) {
            if (w.isInstancedMesh) { w.getMatrixAt(k, im); wm.multiplyMatrices(w.matrixWorld, im); } else wm.copy(w.matrixWorld);
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i).applyMatrix4(wm);
              const dx = v.x - rig.position.x, dz = v.z - rig.position.z;
              const q = `${(dx * right.x + dz * right.z) >= 0 ? 'R' : 'L'}${(dx * fwd.x + dz * fwd.z) >= 0 ? 'F' : 'B'}`;
              if (!lowest[q] || v.y < lowest[q].y) lowest[q] = { y: v.y, x: v.x, z: v.z };
              // Keep a bounded vertical band near the tyre floor. Independent
              // real-triangle measurement across the footprint, rather than
              // comparing a straddling tyre's one lowest point to asphalt.
              if (COMP.look) {
                if (!tread[q]) tread[q] = [];
                if (v.y <= lowest[q].y + 0.15) tread[q].push({ y: v.y, x: v.x, z: v.z });
              }
              if (v.y < minAll) minAll = v.y;
            }
          }
        }
        const quads = {};
        let curbWheels = 0;
        let worstAbs = 0, minErr = Infinity, maxErr = -Infinity;
        for (const [q, l] of Object.entries(lowest)) {
          const candidates = COMP.look ? tread[q].filter(v => v.y <= l.y + 0.15) : [l];
          let contact = null;
          for (const v of candidates) {
            const ry = roadY(v.x, v.z, rig.position.y);
            if (ry && (!contact || v.y - ry.y < contact.err)) contact = { err: v.y - ry.y, curb: ry.curb };
          }
          const ry = contact;
          const err = contact?.err ?? null;
          if (ry?.curb) curbWheels++;
          quads[q] = err === null ? null : +(err * 100).toFixed(2); // cm, + floating / - sunk
          if (err !== null) { worstAbs = Math.max(worstAbs, Math.abs(err)); minErr = Math.min(minErr, err); maxErr = Math.max(maxErr, err); }
        }
        // world scale per axis (column lengths) of root model + wheels
        const scaleOf = obj => { obj.updateWorldMatrix(true, false); const e = obj.matrixWorld.elements;
          return [0, 4, 8].map(o => Math.hypot(e[o], e[o + 1], e[o + 2])); };
        const rootScale = scaleOf(model);
        const wheelScale = wheels.length ? scaleOf(wheels[0]) : null;
        const mountScale = [mount.scale.x, mount.scale.y, mount.scale.z];
        results.push({ carIndex, id: model.name, t, wheels: wheels.length, appFindWheels, quadrants: Object.keys(quads).length,
          quadErrCm: quads, worstAbsCm: +(worstAbs * 100).toFixed(2), minErrCm: +(minErr * 100).toFixed(2),
          maxErrCm: +(maxErr * 100).toFixed(2), lowestWheelYWorld: +minAll.toFixed(4), rigY: +rig.position.y.toFixed(4),
          rootScale, wheelScale, mountScale, curbWheels, roadFound: Object.values(quads).every(q => q !== null) });
      }
    }
    return { hero, asphaltIdentity: identity, triCount, bobAmpCm: +(carRig.rigTuning.bobAmplitude * hero * 100).toFixed(2),
      rollDeg: carRig.rigTuning.bodyRollDeg, results };
  }, ts);
}

let failed = false;
const report = { base, at: new Date().toISOString(), ts, comps: {} };
try {
  for (const c of comps) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setCacheEnabled(false);
    await page.goto(`${base}/${c ? `?${looks ? 'look' : 'comp'}=${c}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__gt3?.readiness?.status && window.__gt3.readiness.status !== 'loading',
      { timeout: 180000, polling: 250 });
    const r = await measure(page, ts);
    r.errors = errors;
    report.comps[c || 'base'] = r;
    const rs = r.results.filter(x => !x.error);
    console.log(`${c || 'base'} hero=${r.hero} identity=${r.asphaltIdentity} cars=${new Set(rs.map(x => x.carIndex)).size} samples=${rs.length} ` +
      `worst|err|=${Math.max(...rs.map(x => x.worstAbsCm))}cm range=[${Math.min(...rs.map(x => x.minErrCm))},${Math.max(...rs.map(x => x.maxErrCm))}]cm ` +
      `roadFound=${rs.every(x => x.roadFound)} errors=${errors.length}`);
    r.pass = errors.length === 0 && rs.length === 10 * ts.length && rs.every(x => x.roadFound && x.quadrants === 4 && x.worstAbsCm <= (looks ? 1 : 3) && x.mountScale.every(v => v === r.hero)
      && Math.max(...x.rootScale) - Math.min(...x.rootScale) < 1e-7);
    console.log(`${c || 'base'} curb contacts: ${JSON.stringify(rs.filter(x => x.carIndex === 3 && x.curbWheels > 0).map(x => ({ t: x.t, wheels: x.curbWheels })))}`);
    failed ||= !r.pass;
    console.log(`${c || 'base'} ${r.pass ? 'PASS' : 'FAIL'}`);
    await writeFile(`${out}/hero-pivot.json`, JSON.stringify(report, null, 1));
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${out}/hero-pivot.json`, JSON.stringify(report, null, 1));

process.exit(failed ? 1 : 0);
