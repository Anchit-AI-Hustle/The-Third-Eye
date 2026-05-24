// Generates icon-192.png and icon-512.png — AJ monogram, Electric Cyan brand
const zlib = require("zlib");
const fs   = require("fs");
const path = require("path");

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

// ── Canvas helpers ─────────────────────────────────────────────────────────
function createCanvas(size) {
  const buf = new Uint8Array(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    const fa = a / 255, bg_a = buf[i + 3] / 255;
    const out_a = fa + bg_a * (1 - fa);
    if (out_a === 0) return;
    buf[i]     = Math.round((r * fa + buf[i]     * bg_a * (1 - fa)) / out_a);
    buf[i + 1] = Math.round((g * fa + buf[i + 1] * bg_a * (1 - fa)) / out_a);
    buf[i + 2] = Math.round((b * fa + buf[i + 2] * bg_a * (1 - fa)) / out_a);
    buf[i + 3] = Math.round(out_a * 255);
  };
  const fillRect = (x, y, w, h, r, g, b, a = 255) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, r, g, b, a);
  };
  const fillCircle = (cx, cy, radius, r, g, b, a = 255) => {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dy * dy <= r2) set(cx + dx, cy + dy, r, g, b, a);
  };
  const fillRing = (cx, cy, outerR, innerR, r, g, b, a = 255) => {
    const o2 = outerR * outerR, i2 = innerR * innerR;
    for (let dy = -outerR; dy <= outerR; dy++)
      for (let dx = -outerR; dx <= outerR; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= o2 && d2 > i2) set(cx + dx, cy + dy, r, g, b, a);
      }
  };
  const drawLine = (x0, y0, x1, y1, thickness, r, g, b) => {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const half = Math.max(1, Math.floor(thickness / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      fillCircle(Math.round(x0 + dx * t), Math.round(y0 + dy * t), half, r, g, b, 255);
    }
  };
  return { buf, set, fillRect, fillCircle, fillRing, drawLine, size };
}

// ── AJ monogram icon ───────────────────────────────────────────────────────
function drawIcon(size) {
  const c = createCanvas(size);
  const cx = size >> 1, cy = size >> 1;

  const [CR, CG, CB] = [0, 212, 255];   // #00D4FF Electric Cyan
  const [SR, SG, SB] = [7, 17, 31];     // #07111F Deep Navy

  // Background #050505
  c.fillRect(0, 0, size, size, 5, 5, 5, 255);

  // Outer glow (cyan fade)
  const glowR = Math.round(size * 0.46);
  for (let t = 0; t < 10; t++) {
    const alpha = Math.round(18 - t * 1.7);
    c.fillRing(cx, cy, glowR + t, glowR + t - 1, CR, CG, CB, Math.max(0, alpha));
  }

  // Circle border
  const outerR  = Math.round(size * 0.44);
  const borderW = Math.max(2, Math.round(size * 0.034));
  c.fillRing(cx, cy, outerR, outerR - borderW, CR, CG, CB, 255);

  // Inner fill (deep navy)
  c.fillCircle(cx, cy, outerR - borderW - 1, SR, SG, SB, 255);

  // ── AJ Monogram ──────────────────────────────────────────────────────────
  // A's right leg doubles as the J stem; J curls left at the bottom.
  const sw  = Math.max(2, Math.round(size * 0.038));
  const mH  = Math.round(size * 0.46);
  const mW  = Math.round(size * 0.40);
  const mX  = cx - Math.round(mW * 0.5);
  const mY  = cy - Math.round(mH * 0.5);

  const apexX = mX + Math.round(mW * 0.42);
  const apexY = mY;

  // A — left diagonal
  c.drawLine(mX, mY + Math.round(mH * 0.68), apexX, apexY, sw, CR, CG, CB);

  // A — crossbar
  c.drawLine(
    mX + Math.round(mW * 0.17), mY + Math.round(mH * 0.52),
    mX + Math.round(mW * 0.64), mY + Math.round(mH * 0.52),
    sw, CR, CG, CB
  );

  // J — top cross-stroke (completing the A apex)
  const jStemX    = mX + Math.round(mW * 0.68);
  const jStemBotY = mY + Math.round(mH * 0.74);
  c.drawLine(apexX, apexY, jStemX, apexY, sw, CR, CG, CB);

  // J — vertical stem
  c.drawLine(jStemX, apexY, jStemX, jStemBotY, sw, CR, CG, CB);

  // J — curl (half-circle arcing left)
  const curveR  = Math.round(sw * 3.2);
  const curveCX = jStemX - curveR;
  for (let angle = 0; angle <= 180; angle += 2) {
    const rad = (angle * Math.PI) / 180;
    for (let dr = 0; dr < sw; dr++) {
      const r = curveR + dr - Math.floor(sw / 2);
      c.set(
        Math.round(curveCX + Math.cos(rad) * r),
        Math.round(jStemBotY + Math.sin(rad) * r),
        CR, CG, CB, 255
      );
    }
  }

  return c.buf;
}

// ── PNG encoder ────────────────────────────────────────────────────────────
function encodePNG(pixels, size) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 4) + 1 + x * 4;
      raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3];
    }
  }
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "public");
for (const size of [192, 512]) {
  const png = encodePNG(drawIcon(size), size);
  const out = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ ${out} (${png.length} bytes)`);
}
fs.copyFileSync(path.join(outDir, "icon-192.png"), path.join(outDir, "logo.png"));
console.log("✓ logo.png");
