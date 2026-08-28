import puppeteer from 'puppeteer-core';
for (const mode of [true, false]) {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: mode ? 'new' : false,
    args: ['--no-sandbox', `--user-data-dir=/tmp/gt3-gpu-${mode}`, '--no-first-run'],
    defaultViewport: { width: 800, height: 600 },
  });
  const p = await b.newPage();
  await p.goto('about:blank');
  const info = await p.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { ok: false };
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return { ok: true, renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?',
             vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : '?' };
  });
  console.log(`headless=${mode}:`, JSON.stringify(info));
  await b.close();
}
