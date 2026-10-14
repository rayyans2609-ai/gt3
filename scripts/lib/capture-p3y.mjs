/** Native crops after timing only. All coordinates are CSS viewport coordinates. */
import { mkdir, copyFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { wait } from './perf-host.mjs';
export async function captureP3y(page, out, config) {
  await mkdir(`${out}/crops`, { recursive: true });
  const captures = [];
  for (const [name, t, motion] of [['grid', null, false], ['hairpin', .283, false], ['car', .283, false], ['motion', .283, true]]) {
    await page.evaluate(t => window.__perfSeek(t), t);
    await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing());
    await wait(2000);
    // Freeze only the decorative grain clock for comparable rest stills. Timing never uses this.
    await page.evaluate(() => {
      const wash = window.__gt3.passes.wash;
      if (!wash.__captureRender) {
        const original = wash.render.bind(wash);
        wash.render = (...args) => { wash.uniforms.uTime.value = 0; return original(...args); };
        wash.__captureRender = true;
      }
    });
    await wait(100); // allow a paced draw to apply the frozen grain before capture
    if (motion) { await page.mouse.wheel({ deltaY: 180 }); await wait(200); }
    const data = await page.evaluate(name => {
      const g = window.__gt3;
      const car = g.scene.getObjectByName('car-rig');
      const world = car.getWorldPosition(g.camera.position.clone());
      world.project(g.camera);
      const x = (world.x + 1) * innerWidth / 2, y = (1 - world.y) * innerHeight / 2;
      const clip = name === 'car' ? { x: Math.max(0, Math.min(innerWidth - 128, x - 64)),
        y: Math.max(0, Math.min(innerHeight - 96, y - 48)), width: 128, height: 96 }
        : { x: Math.max(0, Math.min(innerWidth - 360, x - 200)),
          y: Math.max(0, Math.min(innerHeight - 240, y - 120)), width: 360, height: 240 };
      for (const key of ['x', 'y']) clip[key] = Math.round(clip[key]);
      return { clip, dpr: devicePixelRatio, probe: g.probe(), camera: {
        position: g.camera.position.toArray(), quaternion: g.camera.quaternion.toArray(), fov: g.camera.fov },
        targets: [g.composer.renderTarget1, g.composer.renderTarget2, g.passes.antialias?._edgesRT,
          g.passes.antialias?._weightsRT].filter(Boolean).map(r => ({w:r.width,h:r.height,type:r.texture.type})) };
    }, name);
    const full = `${out}/crops/${config}-${name}-full.png`, path = `${out}/crops/${config}-${name}.png`;
    await page.screenshot({path:full});
    if (['G','E'].includes(config) && ['grid','motion'].includes(name))
      await copyFile(full, `${out}/${config}-${name}-viewport.png`);
    const c = data.clip;
    execFileSync('sips', ['-c', String(c.height * data.dpr), String(c.width * data.dpr), '--cropOffset',
      String(c.y * data.dpr), String(c.x * data.dpr), full, '--out', path], {stdio:'ignore'});
    await unlink(full);
    captures.push({config,name,path,...data});
    console.log('CAPTURE', config, name);
  }
  await writeFile(`${out}/crops.json`, JSON.stringify(captures, null, 2));
  return captures;
}

export async function verifyViewport(page, out) {
  const checks=[];
  for(const [width,height,dpr] of [[1440,900,2],[1360,850,1],[1280,800,2]]) {
    await page.setViewport({width,height,deviceScaleFactor:dpr});
    await wait(1500);
    for(let i=0;i<5;i++){await page.mouse.wheel({deltaY:70});await wait(90);}
    const moving=await page.evaluate(()=>{const g=window.__gt3;return{css:[innerWidth,innerHeight],
      dpr:devicePixelRatio,desktopGuard:document.elementFromPoint(innerWidth/2,innerHeight/2)?.textContent?.includes('built for a desktop display'),probe:g.probe(),aspect:g.camera.aspect,scissor:g.renderer.getScissorTest(),
      targets:[g.composer.renderTarget1.width,g.composer.renderTarget1.height],
      transform:g.renderer.domElement.style.transform,clip:g.renderer.domElement.style.clipPath};});
    const native=Math.min(dpr,2);
    if(moving.desktopGuard || moving.probe.canvasW!==width*native || moving.probe.ratio!==native
      || moving.targets[0]!==width || moving.targets[1]!==height || Math.abs(moving.aspect-width/height)>1e-8)
      throw Error(`Resize/motion viewport mismatch: ${JSON.stringify(moving)}`);
    await page.screenshot({path:`${out}/viewport-${width}-${dpr}-motion.png`});
    await wait(2800);
    const rest=await page.evaluate(()=>{const g=window.__gt3;return{probe:g.probe(),scissor:g.renderer.getScissorTest(),
      targetWidth:g.composer.renderTarget1.width,transform:g.renderer.domElement.style.transform,clip:g.renderer.domElement.style.clipPath};});
    if(rest.probe.applied!==native||rest.targetWidth!==width*native||rest.scissor||rest.transform||rest.clip)
      throw Error(`Resize/rest viewport mismatch: ${JSON.stringify(rest)}`);
    checks.push({width,height,dpr,moving,rest});
  }
  await writeFile(`${out}/viewport-checks.json`,JSON.stringify(checks,null,2));
  console.log('VIEWPORT_CHECKS_PASS');return checks;
}
