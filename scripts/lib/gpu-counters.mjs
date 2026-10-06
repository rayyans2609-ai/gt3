/** Count actual GL calls, including allocations that renderer.info totals can hide. */
export async function installGpuCounters(page) {
  await page.evaluateOnNewDocument(() => {
    const counts = window.__gt3GlCalls = {};
    const methods = ['createProgram', 'compileShader', 'createTexture', 'createBuffer', 'bufferData',
      'texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D',
      'compressedTexImage2D', 'compressedTexImage3D', 'texSubImage2D', 'texSubImage3D',
      'compressedTexSubImage2D', 'compressedTexSubImage3D'];
    for (const name of methods) counts[name] = 0;
    // Three uses WebGL2. Wrap the defining prototype once (some methods are inherited).
    for (const name of methods) {
      let proto = WebGL2RenderingContext.prototype;
      while (proto && !Object.hasOwn(proto, name)) proto = Object.getPrototypeOf(proto);
      if (!proto) continue;
      const original = proto[name];
      proto[name] = function (...args) {
        counts[name]++;
        return original.apply(this, args);
      };
    }
  });
}

export function gpuDelta(before, after) {
  return Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
}
