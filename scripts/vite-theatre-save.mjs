/**
 * Dev-only Vite plugin: lets Theatre Studio (or Claude, via fetch) save a timeline to the repo as
 * versioned JSON instead of browser localStorage. `apply: 'serve'` means it does not exist in
 * `vite build` or `vite preview`.
 *
 *   POST /__theatre/save   header x-gt3-theatre: 1, body = a gt3-theatre-timeline file
 *   -> writes src/authoring/timelines/<projectId>.v<version>.json (the only path it can write)
 *
 * The custom header forces a CORS preflight, so a foreign web page cannot make the dev server
 * write files. The file name is derived from the validated project id, never from the request path.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TimelineFileError, timelineFileName, unwrapTimeline } from '../src/authoring/timelineFile.js';

const ROUTE = '/__theatre/save';
const MAX_BYTES = 4 * 1024 * 1024;
const TIMELINES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/authoring/timelines');

export default function theatreSave() {
  return {
    name: 'gt3-theatre-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST only' });
        if (req.headers['x-gt3-theatre'] !== '1') return reply(403, { error: 'missing x-gt3-theatre header' });
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) { reply(413, { error: 'too large' }); req.destroy(); return; }
          chunks.push(chunk);
        });
        req.on('end', async () => {
          if (res.writableEnded) return;
          try {
            const file = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            unwrapTimeline(file); // validates format, version and state shape
            const name = timelineFileName(file.projectId, file.version);
            await mkdir(TIMELINES_DIR, { recursive: true });
            await writeFile(path.join(TIMELINES_DIR, name), `${JSON.stringify(file, null, 2)}\n`);
            reply(200, { saved: `src/authoring/timelines/${name}`, bytes: size });
          } catch (error) {
            const status = error instanceof TimelineFileError || error instanceof SyntaxError ? 400 : 500;
            reply(status, { error: error.message });
          }
        });
      });
    },
  };
}
