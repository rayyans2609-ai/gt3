/** Phase 3 start/stop + sustained-motion attribution. Diagnostics stay in this harness.
 * GT3_CONFIGS=B GT3_REPEATS=2 GT3_URL=http://127.0.0.1:5211 node scripts/perf-p3y.mjs
 * B current, C no SMAA, F/L/R fixed2/1/1.5, M no blur. Other letters are bounded attribution controls.
 */
import puppeteer from 'puppeteer-core';
import { captureP3y, verifyViewport } from './lib/capture-p3y.mjs';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { hostSample, preflight, hostDegraded, pagingDelta, settleHost, wait } from './lib/perf-host.mjs';

const out = process.env.GT3_OUT || '/tmp/gt3-p3x-run';
const base = process.env.GT3_URL || 'http://127.0.0.1:5211';
const configs = (process.env.GT3_CONFIGS || 'B').split(',');
const repeats = +(process.env.GT3_REPEATS || 3);
const dpr = +(process.env.GT3_DPR || 2);
const diagnostic = ''; // product alternatives are applied only by this harness
const passGpu = process.env.GT3_PASS_GPU === '1';
const gestureInput=process.env.GT3_INPUT==='gesture';
const lightTrace=process.env.GT3_TRACE_LIGHT==='1';
const regions=(process.env.GT3_REGIONS||'grid,straight,hairpin,checkpoint').split(',');
if(!regions.length||regions.some(r=>!['grid','straight','hairpin','checkpoint'].includes(r)))throw Error('Invalid regions');
if (!['', 'viewport', 'canvas-no-msaa', 'blur', 'viewport-blur', 'viewport-cache-blur'].includes(diagnostic)) throw new Error('Invalid diagnostic');
if (configs.length !== 1) throw new Error('One config per browser launch; close between configs');
if (!configs.every(c => ['B', 'C', 'E', 'F', 'L', 'M', 'R', 'S', 'T', 'U', 'V', 'W', 'X'].includes(c)) || !Number.isInteger(repeats) || repeats < 1
  || ![1, 2].includes(dpr)) throw new Error('Invalid configs, repeats or DPR');
const q = (values, percentile) => {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * percentile))] : null;
};
const distribution = values => ({ n: values.length, p50: q(values, .5), p95: q(values, .95),
  p99: q(values, .99), worst: values.length ? Math.max(...values) : null });
const report = { base, dpr, diagnostic, settleMaxMs:+(process.env.GT3_SETTLE_MAX || 45000), headful:process.env.GT3_HEADFUL==='1', blockingWheel:process.env.GT3_BLOCKING_WHEEL==='1', centered:process.env.GT3_CENTER==='1', css: [1280, 800], started: new Date().toISOString(),
  harnessRevision: 'p3x-attribution-v3', passGpu, regions, gestureInput, lightTrace, inputPlan:gestureInput?{speed:350,burstDistance:-420,cruiseDistances:[-1400,1050,-1750]}:{wheelDelta:70,waitMs:70},
  hostRule: '2026-10-13 manager amendment: paging measured; two-sample pressure/idle hard stop',
  sha: process.env.GT3_SOURCE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), runs: [], errors: [] };
await mkdir(out, { recursive: true });
const instrumentation = Object.fromEntries(await Promise.all(['scripts/perf-p3x.mjs','scripts/lib/perf-host.mjs','scripts/lib/capture-p3y.mjs'].map(async path => {
  const source=await readFile(path,'utf8');return [path,{sha256:createHash('sha256').update(source).digest('hex'),source}];
})));
report.instrumentation=Object.fromEntries(Object.entries(instrumentation).map(([p,v])=>[p,v.sha256]));
await writeFile(`${out}/instrumentation.json.gz`,gzipSync(JSON.stringify(instrumentation)));
if(gestureInput&&lightTrace) {
  const start=Date.now();let stable=0;
  while(stable<2) {
    const raw=execFileSync('pmset',['-g','therm'],{encoding:'utf8'});
    const speed=+(raw.match(/CPU_Speed_Limit\s*=\s*(\d+)/)?.[1]??NaN);
    const row={kind:'cool-start',at:new Date().toISOString(),speed};
    await appendFile(`${out}/host.jsonl`,JSON.stringify(row)+'\n');
    stable=speed===100?stable+1:0;
    if(stable===2)break;
    if(Date.now()-start>180000)throw Error('CPU speed limit did not recover within180s; no browser launch');
    await wait(10000);
  }
}
let admitted = await preflight(out);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: process.env.GT3_HEADFUL === '1' ? false : 'new', pipe: true, timeout: 180000, protocolTimeout: 180000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    '--window-size=1280,800', `--user-data-dir=${out}/chrome-${process.pid}`],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: dpr } });
report.browserPid = browser.process().pid;
await writeFile(`${out}/browser.pid`, String(report.browserPid));
let stopped = false;
let page, traceRunning = false, stopping;
const persist = () => writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
// Startup can page before the first measured repetition. Cover that interval and
// retain incomplete telemetry before closing the browser; it is never a valid run.
async function stop(reason) {
  if (stopping) return stopping;
  stopped = true;
  report.stop = { reason, at: new Date().toISOString(), incomplete: true };
  stopping = (async () => {
    try {
      if (page && !page.isClosed()) {
        const partial = await Promise.race([page.evaluate(() => {
          const p = window.__perf;
          if (!p) return null;
          p.recording = false;
          return { frames: p.frames, gl: p.gl, switches: p.switches,
            input: p.input, transitions:p.transitions, longTasks: p.longTasks, disjoint: p.disjoint, rafNames:window.__perfRafNames,last:p.last,stalled:p.stalled };
        }), wait(3000).then(() => null)]);
        if (partial) {
          report.stop.partial = `${out}/interrupted-frames.json.gz`;
          await writeFile(report.stop.partial, gzipSync(JSON.stringify(partial)));
        }
        if (traceRunning) {
          traceRunning = false;
          await Promise.race([page.tracing.stop(), wait(3000)]);
        }
      }
    } catch (error) { report.stop.captureError = error.message; }
    finally { await persist(); await browser.close(); }
  })();
  return stopping;
}
const terminate = () => { void stop('SIGTERM').catch(error => { report.errors.push(error.message); }); };
process.once('SIGTERM', terminate);
let monitorBusy = false, measuredWindow = false, lastMonitor = admitted, lastMonitorMeasured = false;
const monitor = setInterval(async () => {
  if (monitorBusy || stopped) return;
  monitorBusy = true;
  try {
    const sample = await hostSample();
    await appendFile(`${out}/host.jsonl`, `${JSON.stringify({ kind: 'monitor', sample })}\n`);
    if (hostDegraded(lastMonitor, sample, measuredWindow || lastMonitorMeasured)) await stop('Two consecutive hard-stop host samples');
    lastMonitor = sample; lastMonitorMeasured = measuredWindow;
    if (page && !page.isClosed()) {
      const pingStart = Date.now();
      const ping = await Promise.race([page.evaluate(() => {
        const p = window.__perf;
        return {now:performance.now(),last:p?.last,stalled:p?.stalled,recording:p?.recording,frames:p?.frames.length,
          responsive:!p?.stalled && (!p?.recording || !p.last || performance.now()-p.last<5000)};
      }), wait(5000).then(() => ({timeout:true}))]);
      await appendFile(`${out}/host.jsonl`, `${JSON.stringify({kind:'ping',ping,ms:Date.now()-pingStart})}\n`);
      if (ping.timeout || !ping.responsive) await stop('CDP/RAF responsiveness exceeded 5 seconds');
    }
  } catch (error) { await stop(`Host monitor failed: ${error.message}`); }
  finally { monitorBusy = false; }
}, 30000);
try {
  report.browser = await browser.version();
  const cdp = await browser.target().createCDPSession();
  report.gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
  page = (await browser.pages())[0];
  const inputCdp=await page.createCDPSession();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => {
    if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.evaluateOnNewDocument(diagnostic => {
    performance.setResourceTimingBufferSize(2000);
    // Wrap the real application RAF, including updates before composer.render().
    const raf = window.requestAnimationFrame.bind(window);
    window.__perfRafNames = {};
    window.requestAnimationFrame = callback => raf(timestamp => {
      const p = window.__perf;
      window.__perfRafNames[callback.name] = (window.__perfRafNames[callback.name] || 0) + 1;
      if (callback.name !== 'frame' || !p?.recording) return callback(timestamp);
      const now = performance.now(), g = window.__gt3;
      const f = { t: now, raf: timestamp, dt: p.last ? now - p.last : null,
        cpu: 0, gpu: null, allocations: 0, phase: p.phase, passes: {}, calls: {}, scrollY: window.scrollY };
      if (f.dt > 5000) p.stalled = true;
      p.last = now; p.current = f;
      callback(timestamp);
      f.cpu = performance.now() - now;
      const probe = g.probe();
      Object.assign(f, { mode:probe.mode,locked:probe.locked,dpr: probe.applied, speed: probe.speed01, progress: probe.progress,
        output:{transform:g.renderer.domElement.style.transform,clip:g.renderer.domElement.style.clipPath,scissor:g.renderer.getScissorTest()}, programs:g.renderer.info.programs?.length, car: g.scene.getObjectByName('car-mount')?.children[0]?.name });
      f.rendered=Object.keys(f.passes).length>0;
      f.drawDt=f.rendered&&p.lastDraw?now-p.lastDraw:null;
      if(f.rendered)p.lastDraw=now;
      p.frames.push(f); p.current = null;
    });
    for (const method of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'createTexture', 'deleteTexture', 'bufferData', 'bufferSubData', 'createProgram', 'compileShader', 'linkProgram', 'finish', 'flush', 'readPixels', 'fenceSync', 'clientWaitSync', 'waitSync', 'getQueryParameter', 'getParameter', 'viewport', 'scissor']) {
      let proto = WebGL2RenderingContext.prototype;
      while (proto && !Object.hasOwn(proto, method)) proto = Object.getPrototypeOf(proto);
      const original = proto[method];
      proto[method] = function (...args) {
        const p = window.__perf;
        if (!p?.recording || p.noGL) return original.apply(this,args);
        const start = performance.now();
        const result = original.apply(this,args);
        const ms = performance.now()-start;
        if (p.current) {
          if (/texImage|texStorage/.test(method)) p.current.allocations++;
          const c=p.current.calls[method] ??= {n:0,ms:0,max:0}; c.n++; c.ms+=ms; c.max=Math.max(c.max,ms);
        }
        if (!/^(getQueryParameter|getParameter|viewport|scissor)$/.test(method) || ms>1)
          p.gl.push({t:start,method,ms,width:args[3],height:args[4]});
        return result;
      };
    }
  }, diagnostic);
  for (const config of configs) {
    if (stopped) break;
    if (config !== configs[0]) admitted = await preflight(out);
    await page.goto(`${base}/${config === 'D' ? '?props=lean' : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready', { timeout: 180000 });
    await wait(800);
    if (process.env.GT3_CENTER === '1') await page.mouse.move(640,400);
    await page.mouse.wheel({ deltaY: 20 }); await wait(1800);
    const setup = await page.evaluate(async ({ config, dpr, diagnostic, passGpu }) => {
      const g = window.__gt3, gl = g.renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) throw new Error('GPU timer extension unavailable');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
      if (!gpu || !/ANGLE.*Metal/i.test(gpu) || /SwiftShader|software/i.test(gpu)) throw new Error(`Unacceptable GPU: ${gpu}`);
      if (innerWidth !== 1280 || innerHeight !== 800 || devicePixelRatio !== dpr)
        throw new Error('Viewport or DPR mismatch');
      if (config === 'C') g.passes.antialias.enabled = false;
      if (config === 'M' || config === 'F') g.passes.motionBlur.enabled = false;
      const urls=performance.getEntriesByType('resource').map(e=>e.name).filter(url=>new URL(url).pathname==='/src/scene/sceneSetup.js');
      let sceneSetup;
      for(const url of urls) { const candidate=await import(url); if(candidate.renderer===g.renderer) {sceneSetup=candidate;break;} }
      if(!sceneSetup)throw Error('Cannot identify the live sceneSetup module; diagnostic refused');
      if (['F','L','R'].includes(config)) {
        const fixed = config === 'F' ? 2 : config === 'R' ? 1.5 : 1;
        sceneSetup.ADAPTIVE_RES.high = fixed;
        sceneSetup.ADAPTIVE_RES.low = fixed;
      }
      // Diagnostic pacing: skip only expensive stationary draws, keeping the one RAF/update loop.
      if (['S','T','X'].includes(config)) {
        const render = g.composer.render.bind(g.composer); let nextDraw = 0;
        g.composer.render = dt => {
          const now = window.__perf?.current?.raf ?? performance.now();
          const period = config === 'T' ? 1000/15 : 1000/30;
          if (config === 'X' || g.probe().speed01 < .02) {
            if (now < nextDraw - 1) return;
            nextDraw = now + period - ((now - nextDraw) % period);
          } else nextDraw = now;
          return render(dt);
        };
      }
      if (['U','V'].includes(config)) {
        // Isolate CSS display switches without changing target dimensions or DPR policy.
        const style = g.renderer.domElement.style;
        for (const name of ['transform','clipPath']) {
          Object.defineProperty(style,name,{get:()=>'',set:()=>{}});
        }
      }
      if (config === 'V') {
        g.renderer.setViewport(0,0,innerWidth,innerHeight);
        g.renderer.setScissorTest(false);
        g.renderer.setViewport=()=>{};
        g.renderer.setScissor=()=>{};
        g.renderer.setScissorTest=()=>{};
      }

      const p = window.__perf = { frames: [], gl: [], switches: [], longTasks: [], input: [], pending: [], recording: false,
        current: null, last: null, phase: '', disjoint: 0, transitions: [], noGL: config === 'W' };
      new PerformanceObserver(list => {
        if (p.recording) for (const e of list.getEntries()) p.longTasks.push({ t: e.startTime, duration: e.duration });
      }).observe({ type: 'longtask', buffered: false });
      const original = g.composer.render.bind(g.composer);
      g.composer.render = dt => {
        if(p.paused) return;
        if (!p.recording || !p.current || config === 'W') return original(dt);
        while (p.pending.length && gl.getQueryParameter(p.pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
          const { query, frame, name } = p.pending.shift();
          if (gl.getParameter(ext.GPU_DISJOINT_EXT)) p.disjoint++;
          else { const ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6; if (name) { frame.gpu=(frame.gpu??0)+ms; frame.passes[name].gpu=ms; } else frame.gpu=ms; }
          gl.deleteQuery(query);
        }
        if (passGpu) return original(dt);
        const query = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        try { original(dt); } finally { gl.endQuery(ext.TIME_ELAPSED_EXT); }
        p.pending.push({ query, frame: p.current });
      };
      for (const [index,pass] of g.composer.passes.entries()) {
        const name = pass === g.passes.antialias ? 'smaa' : pass === g.passes.motionBlur ? 'blur' : pass === g.passes.wash ? 'wash' : `scene${index}`;
        const render = pass.render.bind(pass);
        pass.render = (...args) => {
          const frame=p.current;
          if (!p.recording || !frame) return render(...args);
          const start=performance.now(); frame.passes[name] = {cpu:0,gpu:null};
          let query;
          if (passGpu) { query=gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT,query); }
          try { return render(...args); } finally {
            if (query) {
              gl.endQuery(ext.TIME_ELAPSED_EXT);
              p.pending.push({query,frame,name});
            }
            frame.passes[name].cpu=performance.now()-start;
          }
        };
      }
      for (const [object,name] of [[g.renderer,'renderer'],[g.composer,'composer']]) {
        for (const method of ['setPixelRatio','setSize','setViewport','setScissor','setScissorTest']) {
          if (!object[method]) continue;
          const fn=object[method].bind(object);
          object[method]=(...args)=>{
            const t=performance.now(); const result=fn(...args);
            if(p.recording && /setPixelRatio|setSize/.test(method)) p.gl.push({t,method:`${name}.${method}`,ms:performance.now()-t,args});
            return result;
          };
        }
      }
      const setRatio = g.composer.setPixelRatio.bind(g.composer);
      g.composer.setPixelRatio = value => {
        const before=g.composer._pixelRatio,t=p.current?.t??performance.now(),begin=performance.now();
        setRatio(value);
        if(p.recording&&before!==value)p.switches.push({t,from:before,to:value,cpu:performance.now()-begin,source:'composer'});
      };
      const route = await import('/src/scene/trackCurve.js');
      const drive = await import('/src/scroll/scrollDrive.js');
      const camera = await import('/src/scene/aerialCamera.js');
      window.__perfSeek = t => { drive.seekTo(t == null ? 0 : route.progressAtRouteT(t), { instant: true }); camera.snap(); };
      window.addEventListener('wheel', e => { if (p.recording) {p.input.push({ t: performance.now(), event:e.timeStamp, delta: e.deltaY, phase:p.phase, segment:p.segment }); performance.mark('p3x-wheel');} }, { passive: true });
      return { gpu, css: [innerWidth, innerHeight], dpr: devicePixelRatio, probe: g.probe(),
        contextAntialias: gl.getContextAttributes().antialias, canvasSamples: gl.getParameter(gl.SAMPLES),
        passes: g.composer.passes.map(x => ({ type: x.constructor.name, enabled: x.enabled })),
        memory: { ...g.renderer.info.memory }, heap: performance.memory?.usedJSHeapSize,
        gates: route.CHECKPOINT_ROUTE_T, checkpointProgress: route.CHECKPOINT_T[3],
        aaTargets: g.passes.antialias ? [g.passes.antialias._edgesRT.width, g.passes.antialias._edgesRT.height] : null };
    }, { config, dpr, diagnostic, passGpu });
    if(process.env.GT3_BLOCKING_WHEEL==='1') await page.evaluate(()=>window.addEventListener('wheel',()=>{}, {passive:false}));
    console.log('SETUP', config, JSON.stringify(setup));
    if (process.env.GT3_AUDIT === '1') {
      await page.evaluate(() => {window.__perf.recording=true;window.__perf.phase='audit';});
      await wait(2500);
      console.log('AUDIT', JSON.stringify(await page.evaluate(() => ({names:window.__perfRafNames,
        frames:window.__perf.frames.slice(-3),last:window.__perf.last,stalled:window.__perf.stalled,
        rafSource:String(window.requestAnimationFrame),pending:window.__perf.pending.length,errors:window.__perf.errors}))));
      break;
    }
    await page.evaluate(() => {window.__perf.recording=true;window.__perf.phase='instrumentation-warmup';});
    await wait(800);
    const audit = await page.evaluate(() => {const p=window.__perf;p.recording=false;
      return {frames:p.frames.length,gpu:p.frames.filter(f=>Number.isFinite(f.gpu)).length,names:window.__perfRafNames,probe:window.__gt3.probe(),dprs:[...new Set(p.frames.map(f=>f.dpr))]};});
    console.log('HOOK_AUDIT', JSON.stringify(audit));
    if (audit.frames<5 || (config !== 'W' && audit.gpu<3)) throw new Error('RAF/GPU hook invalid');
    if(['F','L','R'].includes(config)) {const fixed=config==='F'?2:config==='R'?1.5:1;if(audit.probe.applied!==fixed)throw Error('Fixed resolution diagnostic did not apply');}
    report.hookAudit=audit;
    if(config==='V') {
      await page.mouse.wheel({deltaY:70}); await wait(350);
      report.motionAudit=await page.evaluate(()=>{const g=window.__gt3;return {
        probe:g.probe(),viewport:g.renderer.getViewport({copy:v=>v.toArray()}),
        transform:g.renderer.domElement.style.transform,clip:g.renderer.domElement.style.clipPath,
        scissor:g.renderer.getScissorTest()};});
      const a=report.motionAudit;
      if(a.probe.applied!==1||a.scissor||a.transform||a.clip||a.viewport.join(',')!=='0,0,1280,800')
        throw Error(`Stable canvas moving audit failed: ${JSON.stringify(a)}`);
      console.log('MOTION_AUDIT',JSON.stringify(a));
      await wait(2500);
    }
    report.setups ??= [];
    report.setups.push({ config, ...setup });
    await persist();
    const startupHost = await hostSample();
    await appendFile(`${out}/host.jsonl`, `${JSON.stringify({ kind: 'startup', config, admitted, sample: startupHost })}\n`);
    if (stopped || hostDegraded(lastMonitor, startupHost)) {
      await stop('Two consecutive hard-stop startup samples');
      throw new Error(report.stop.reason);
    }
    if (report.errors.length) throw new Error('Page/resource errors invalidate this configuration; inspect report.errors');
    if(process.env.GT3_VIEWPORT_ONLY==='1'){report.viewportChecks=await verifyViewport(page,out);break;}
    for (let rep = 1; rep <= repeats; rep++) {
      const before = await hostSample();
      const hostWindows = [];
      const tracePath = `${out}/${config}-${rep}-trace.json`;
      traceRunning = false;
      const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize);
      await page.evaluate(() => {
        const p = window.__perf; p.frames = []; p.gl = []; p.switches = []; p.input = []; p.longTasks = [];
        p.last = null; p.disjoint = 0; p.recording = false; p.transitions=[];p.paused=false;
      });
      // Seeks between regions are setup, excluded from timing. All travel inside regions is wheel input.
      for (const [region, t] of [['grid', null], ['straight', .105], ['hairpin', .263], ['checkpoint', setup.gates[3] - .008]].filter(([r])=>regions.includes(r))) {
        await page.evaluate(t => window.__perfSeek(t), t);
        await wait(1800);
        await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing());
        const settled = await settleHost(out, `${config}-${rep}-${region}`, () => {}, +(process.env.GT3_SETTLE_MAX || 45000));
        const windowBefore = await hostSample();
        if (rep === 1 && region === regions.at(-1)) {
          await page.tracing.start({ path: tracePath, categories: lightTrace
            ? ['toplevel','devtools.timeline','blink.user_timing','disabled-by-default-v8.gc']
            : ['toplevel', 'devtools.timeline', 'blink.user_timing', 'input', 'latencyInfo', 'cc', 'gpu', 'viz', 'benchmark', 'disabled-by-default-devtools.timeline', 'disabled-by-default-v8.gc'] });
          traceRunning = true;
        }
        measuredWindow = true;
        await page.evaluate(region => { const p = window.__perf; p.recording = true; p.last = null; p.lastDraw=null; p.phase = `${region}:rest`; performance.mark(`p3y-start:${region}`); }, region);
        await wait(1500);
        for (let burst = 0; burst < 2; burst++) {
          await page.evaluate(({region,burst}) => { const p=window.__perf;
            p.phase = `${region}:burst`; p.segment=`${region}:burst-${burst}`;
            p.transitions.push({type:'start',t:performance.now(),phase:p.phase,segment:p.segment});
          }, {region,burst});
          if(gestureInput) await inputCdp.send('Input.synthesizeScrollGesture',
            {x:640,y:400,yDistance:-420,speed:350,preventFling:true,gestureSourceType:'mouse',interactionMarkerName:`p3x-${region}-burst${burst}`});
          else {
            const end = Date.now() + 1200;
            while (Date.now() < end) { await page.mouse.wheel({ deltaY: 70 }); await wait(70); }
          }
          await page.evaluate(region => { const p=window.__perf; p.phase = `${region}:stop`;
            p.transitions.push({type:'stop',t:performance.now(),phase:p.phase,segment:p.segment});
          }, region);
          await wait(2500);
        }
        await page.evaluate(region => { const p=window.__perf; p.phase = `${region}:cruise`;p.segment=`${region}:cruise`;
          p.transitions.push({type:'start',t:performance.now(),phase:p.phase,segment:p.segment});
        }, region);
        if(gestureInput) {
          // Browser-owned high-cadence input avoids serial dispatch ACK delays in the driver.
          for(const yDistance of [-1400,1050,-1750])await inputCdp.send('Input.synthesizeScrollGesture',
            {x:640,y:400,yDistance,speed:350,preventFling:true,gestureSourceType:'mouse',interactionMarkerName:`p3x-${region}`});
        } else {
          const end = Date.now() + 12000;
          while (Date.now() < end) { const remaining=end-Date.now(); await page.mouse.wheel({ deltaY: remaining<8000 && remaining>5000 ? -70 : 70 }); await wait(70); }
        }
        await page.evaluate(region => { const p=window.__perf;p.phase = `${region}:stop`;
          p.transitions.push({type:'stop',t:performance.now(),phase:p.phase,segment:p.segment});
        }, region);
        await wait(2500);
        await page.evaluate(region => { performance.mark(`p3y-end:${region}`); window.__perf.recording = false; }, region);
        measuredWindow = false;
        const windowAfter = await hostSample();
        hostWindows.push({ region, settled: settled.settled, waitedMs: settled.waitedMs,
          before: { ...windowBefore, processes: undefined }, after: { ...windowAfter, processes: undefined },
          ...pagingDelta(windowBefore, windowAfter) });
        await appendFile(`${out}/windows.jsonl`, `${JSON.stringify({ config, rep, ...hostWindows.at(-1) })}\n`);
        const partial = await page.evaluate(() => {
          const p = window.__perf; return {frames:p.frames,gl:p.gl,switches:p.switches,input:p.input,transitions:p.transitions,
            longTasks:p.longTasks,heapAfter:performance.memory?.usedJSHeapSize,disjoint:p.disjoint};
        });
        await writeFile(`${out}/${config}-${rep}-partial.json.gz`, gzipSync(JSON.stringify(partial)));
        if (stopped) throw new Error('Host stop requested');
      }
      // Serialize telemetry before exporting the bounded trace; export cannot lose a valid run.
      await page.evaluate(()=>{window.__perf.paused=true;});
      await wait(500); // drain already-submitted GPU work before harvesting query results
      if (rep === 1) {
        console.log('TRACE_EXPORT', config, rep);
        await Promise.race([page.tracing.stop(),wait(45000).then(()=>{throw Error('Trace export exceeded45sec');})]); traceRunning = false;
      }
      const data = await page.evaluate(() => {
        const p = window.__perf, gl=window.__gt3.renderer.getContext(), ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
        while(p.pending.length && gl.getQueryParameter(p.pending[0].query,gl.QUERY_RESULT_AVAILABLE)) {
          const {query,frame,name}=p.pending.shift();
          if(gl.getParameter(ext.GPU_DISJOINT_EXT))p.disjoint++;else {const ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;if(name){frame.gpu=(frame.gpu??0)+ms;frame.passes[name].gpu=ms;}else frame.gpu=ms;}
          gl.deleteQuery(query);
        }
        return { frames: p.frames, gl: p.gl, switches: p.switches, input: p.input, transitions:p.transitions, longTasks: p.longTasks,
          heapAfter: performance.memory?.usedJSHeapSize, disjoint: p.disjoint,
          probe: window.__gt3.probe(), memory: { ...window.__gt3.renderer.info.memory } };
      });
      const after = await hostSample();
      await appendFile(`${out}/host.jsonl`, `${JSON.stringify({ kind: 'run', config, rep, before, after })}\n`);
      await writeFile(`${out}/${config}-${rep}-frames.json.gz`, gzipSync(JSON.stringify(data)));
      if(config==='E'&&data.switches.some(s=>!data.frames.find(f=>f.t===s.t)?.rendered))throw Error('Resolution switch skipped its matching draw');
      if(config==='V'&&data.frames.some(f=>f.output.transform||f.output.clip||f.output.scissor))throw Error('Stable canvas control changed display state');
      if(['F','L','R'].includes(config)&&(data.switches.length||new Set(data.frames.map(f=>f.dpr)).size!==1))throw Error('Fixed resolution control switched; invalid run');
      if(gestureInput&&data.frames.some(f=>f.mode!=='race'||f.locked))throw Error('Native input workload left unlocked Tour');
      if(gestureInput&&data.input.length<30)throw Error('Native gesture did not produce enough observed wheel input');
      if(gestureInput) for(const region of regions) {
        const events=data.input.filter(e=>e.phase.startsWith(`${region}:`));
        const signed=events.reduce((s,e)=>s+e.delta,0),absolute=events.reduce((s,e)=>s+Math.abs(e.delta),0);
        if(Math.abs(signed-2940/dpr)>1||Math.abs(absolute-5040/dpr)>1)
          throw Error(`Native input distance mismatch ${region}: ${signed}/${absolute}`);
      }
      const frames = data.frames.filter(f => f.dt !== null);
      if (frames.length < 100 || config !== 'W' && frames.filter(f => Number.isFinite(f.gpu)).length < frames.filter(f => Object.keys(f.passes).length).length * .8)
        throw new Error('Insufficient application frame/GPU samples; harness result is invalid');
      const crossingFrames = frames.filter(f => f.phase.startsWith('checkpoint:'));
      const crossed = regions.includes('checkpoint') ? Math.min(...crossingFrames.map(f => f.progress)) < setup.checkpointProgress
        && Math.max(...crossingFrames.map(f => f.progress)) >= setup.checkpointProgress : null;
      if (crossed === false) throw new Error('Scripted wheel input did not cross the requested checkpoint');
      const duration = frames.reduce((sum, f) => sum + f.dt, 0);
      const subset = fs => ({ frame: distribution(fs.map(f => f.dt)), gpu: distribution(fs.map(f => f.gpu).filter(Number.isFinite)),
        cpu: distribution(fs.map(f => f.cpu)), over33per10s: fs.filter(f => f.dt > 33).length * 10000 / fs.reduce((s, f) => s + f.dt, 0),
        over50per10s: fs.filter(f => f.dt > 50).length * 10000 / fs.reduce((s, f) => s + f.dt, 0) });
      const run = { config, rep, setup, before: { ...before, processes: undefined }, after: { ...after, processes: undefined },
        contaminated: false, paging: hostWindows.some(w => w.pageouts > 0 || w.swapouts > 0),
        unsettled: hostWindows.some(w => !w.settled), hostWindows,
        timingPaging: hostWindows.reduce((sum, w) => ({ pageouts: sum.pageouts + w.pageouts, swapouts: sum.swapouts + w.swapouts }), {pageouts: 0, swapouts: 0}),
        crossed, duration, ...subset(frames), heapBefore,
        heapAfter: data.heapAfter, memory: data.memory, disjoint: data.disjoint,
        longTasks: data.longTasks, switchCount: data.switches.length, glAllocations: data.gl.filter(x => /texImage|texStorage/.test(x.method)).length,
        byPhase: Object.fromEntries(['rest', 'burst', 'cruise', 'stop'].map(s => [s, subset(frames.filter(f => f.phase.endsWith(`:${s}`)))])),
        byRegion: Object.fromEntries(['grid', 'straight', 'hairpin', 'checkpoint'].map(s => [s, subset(frames.filter(f => f.phase.startsWith(`${s}:`)))])),
        switches: data.switches.map(s => ({ ...s, nearFrames: frames.filter(f => f.t >= s.t - 100 && f.t <= s.t + 350)
          .map(f => ({ t: f.t, dt: f.dt, gpu: f.gpu, cpu: f.cpu, allocations: f.allocations, dpr: f.dpr })) })),
        worstFrames: [...frames].sort((a, b) => b.dt - a.dt).slice(0, 12) };
      if (rep === 1) {
        const trace = JSON.parse(await readFile(tracePath, 'utf8')).traceEvents;
        const main = trace.filter(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map(e => `${e.pid}:${e.tid}`);
        const marks = trace.filter(e => /^p3y-(start|end):/.test(e.name));
        const windows = ['grid', 'straight', 'hairpin', 'checkpoint'].map(region => {
          const start = marks.find(e => e.name === `p3y-start:${region}`)?.ts;
          const end = marks.find(e => e.name === `p3y-end:${region}`)?.ts;
          return [start, end];
        });
        const measured = e => windows.some(([start, end]) => e.ts >= start && e.ts <= end);
        const taskEvents = trace.filter(e => measured(e) && e.ph === 'X' && e.dur >= 50000 && main.includes(`${e.pid}:${e.tid}`)
          && /RunTask|ThreadControllerImpl::RunTask/.test(e.name));
        const gc = trace.filter(e => measured(e) && e.ph === 'X' && main.includes(`${e.pid}:${e.tid}`)
          && /^(MinorGC|MajorGC)$/.test(e.name));
        const present=trace.filter(e=>e.name==='AnimationFrame::Presentation'&&measured(e)).map(e=>e.ts/1000).sort((a,b)=>a-b);
        const backpressure=trace.filter(e=>e.name==='CALayerTreeCoordinator::ApplyBackpressure'&&e.ph==='X'&&measured(e));
        run.trace = { path: tracePath, windows, mainThreads: main,
          presentation:distribution(present.slice(1).map((t,i)=>t-present[i])),
          frameTrackers:trace.filter(e=>e.name==='FrameSequenceTrackerV3'&&e.ph==='b'&&measured(e)).map(e=>e.args),
          backpressure:{time:distribution(backpressure.map(e=>e.dur/1000)),cpu:distribution(backpressure.map(e=>(e.tdur??0)/1000)),events:backpressure.map(e=>({ts:e.ts,ms:e.dur/1000,cpuMs:(e.tdur??0)/1000}))}, longTasks: taskEvents.map(e => ({ name: e.name, ts: e.ts, ms: e.dur / 1000, cpuMs:(e.tdur??0)/1000, args:e.args })),
          gc: gc.map(e => ({ name: e.name, ts: e.ts, ms: e.dur / 1000, args: e.args })),
          gcMs: gc.reduce((s, e) => s + e.dur / 1000, 0), events: trace.length };
      }
      report.runs.push(run);
      await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
      console.log('RUN', JSON.stringify({ config, rep, contaminated: run.contaminated, frame: run.frame, gpu: run.gpu,
        over33: run.over33per10s, over50: run.over50per10s, switches: run.switchCount, allocations: run.glAllocations,
        paging: run.paging, timingPaging: run.timingPaging, totalPaging: pagingDelta(before, after) }));

    }
    if (process.env.GT3_CAPTURES === '1') {
      await page.evaluate(()=>{window.__perf.paused=false;});
      report.captures = await captureP3y(page, out, config);
    }
    if(config==='B' && process.env.GT3_VIEWPORT_CHECK==='1')report.viewportChecks=await verifyViewport(page,out);
  }
} catch (error) { report.errors.push(error.stack); throw error; }
finally {
  clearInterval(monitor);
  process.removeListener('SIGTERM', terminate);
  if (stopping) await stopping;
  report.ended = new Date().toISOString();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
