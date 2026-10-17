/** Dependency-free 8-bit RGBA PNG / APNG encoder for W4 evidence (stills, motion strips). */
import { deflateSync } from 'node:zlib';
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
const ihdr = (w, h) => { const b = Buffer.alloc(13); b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b[8] = 8; b[9] = 6; return chunk('IHDR', b); };
function scanlines(rgba, w, h) {
  const out = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { out[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(out, y * (w * 4 + 1) + 1); }
  return deflateSync(out, { level: 6 });
}
const SIG = Buffer.from('89504e470d0a1a0a', 'hex');
export function encodePNG(rgba, w, h) {
  return Buffer.concat([SIG, ihdr(w, h), chunk('IDAT', scanlines(rgba, w, h)), chunk('IEND', Buffer.alloc(0))]);
}
/** frames: array of RGBA buffers, all w×h. delayMs per frame; loops forever. */
export function encodeAPNG(frames, w, h, delayMs = 1000 / 30) {
  const parts = [SIG, ihdr(w, h)];
  const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4); parts.push(chunk('acTL', actl));
  let seq = 0;
  frames.forEach((f, i) => {
    const fc = Buffer.alloc(26); fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8);
    fc.writeUInt16BE(Math.round(delayMs), 20); fc.writeUInt16BE(1000, 22); parts.push(chunk('fcTL', fc));
    const data = scanlines(f, w, h);
    if (i === 0) parts.push(chunk('IDAT', data));
    else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++, 0); parts.push(chunk('fdAT', Buffer.concat([s, data]))); }
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
/** Horizontal side-by-side of equal-height RGBA images with a gap. */
export function hstack(images, gap = 6) {
  const h = images[0].h, w = images.reduce((s, im) => s + im.w, 0) + gap * (images.length - 1);
  const out = Buffer.alloc(w * h * 4, 255); let x0 = 0;
  for (const im of images) { for (let y = 0; y < h; y++) Buffer.from(im.rgba.buffer, im.rgba.byteOffset + y * im.w * 4, im.w * 4).copy(out, (y * w + x0) * 4); x0 += im.w + gap; }
  return { rgba: out, w, h };
}
