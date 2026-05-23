// Generates icon-192.png and icon-512.png using only Node.js built-ins
const zlib = require("zlib");
const fs = require("fs");
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([t, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, t, data, crcBuf]);
}

// ── Draw helpers ───────────────────────────────────────────────────────────
function createCanvas(size) {
  // RGBA pixel buffer
  const buf = new Uint8Array(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    const fa = a / 255;
    const bg_a = buf[i + 3] / 255;
    const out_a = fa + bg_a * (1 - fa);
    if (out_a === 0) return;
    buf[i    ] = Math.round((r * fa + buf[i    ] * bg_a * (1 - fa)) / out_a);
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
  return { buf, set, fillRect, fillCircle, fillRing, size };
}

function drawIcon(size) {
  const c = createCanvas(size);
  const s = size;
  const cx = s >> 1, cy = s >> 1;

  // Background: dark #07070F
  c.fillRect(0, 0, s, s, 7, 7, 15, 255);

  // Outer glow ring (subtle, large)
  const glowR = Math.round(s * 0.46);
  for (let t = 0; t < 8; t++) {
    const alpha = Math.round(12 - t * 1.3);
    c.fillRing(cx, cy, glowR + t, glowR + t - 1, 59, 130, 246, Math.max(0, alpha));
  }

  // Main circle border (blue #3B82F6)
  const outerR = Math.round(s * 0.44);
  const borderW = Math.max(2, Math.round(s * 0.035));
  c.fillRing(cx, cy, outerR, outerR - borderW, 59, 130, 246, 255);

  // Inner circle fill (slightly lighter dark)
  c.fillCircle(cx, cy, outerR - borderW, 12, 12, 22, 255);

  // Draw "J" — scaled proportionally
  const unit = Math.round(s * 0.06);  // base unit for stroke width
  const jH = Math.round(s * 0.50);    // total height of the J
  const jW = Math.round(s * 0.26);    // width
  const jX = cx - Math.round(jW * 0.3); // horizontal center
  const jY = cy - Math.round(jH * 0.5); // top of J
  const sw = Math.max(2, unit);        // stroke width

  // Blue colour for J: #60A5FA (slightly lighter)
  const jr = 96, jg = 165, jb = 250;

  // Top horizontal bar of J
  const barH = sw;
  c.fillRect(jX, jY, jW, barH, jr, jg, jb, 255);

  // Vertical stroke (right side of J, going down)
  const vx = jX + jW - sw;
  c.fillRect(vx, jY, sw, jH - Math.round(jH * 0.22), jr, jg, jb, 255);

  // Bottom curve of J — approximate with rects
  const curveY = jY + jH - Math.round(jH * 0.28);
  const curveR = Math.round(jW * 0.42);
  const curveCX = jX + jW - sw - curveR + Math.round(sw / 2);
  const curveCY = curveY;
  // Quarter circle (bottom-left of the J curl)
  for (let angle = 90; angle <= 270; angle += 2) {
    const rad = (angle * Math.PI) / 180;
    for (let dr = 0; dr < sw; dr++) {
      const r = curveR + dr - Math.round(sw / 2);
      const px = Math.round(curveCX + Math.cos(rad) * r);
      const py = Math.round(curveCY + Math.sin(rad) * r);
      c.set(px, py, jr, jg, jb, 255);
    }
  }

  // Small dot / accent at bottom of J left foot
  c.fillCircle(jX + Math.round(jW * 0.12), jY + jH - Math.round(sw / 2), Math.round(sw * 0.6), jr, jg, jb, 200);

  return c.buf;
}

function encodePNG(pixels, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA

  // Raw scanlines (filter byte 0 + RGBA per pixel)
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 4) + 1 + x * 4;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "public");

for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const png = encodePNG(pixels, size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ ${outPath} (${png.length} bytes)`);
}

// Also write as logo.png (192 version) for backwards compat
fs.copyFileSync(path.join(outDir, "icon-192.png"), path.join(outDir, "logo.png"));
console.log("✓ logo.png (copy of icon-192.png)");
