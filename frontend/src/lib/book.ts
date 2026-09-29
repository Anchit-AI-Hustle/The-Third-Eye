// Book Studio: the outline the `book` tool writes, split into chapters to write
// one at a time, and the finished manuscript packed as an EPUB 3 — the format
// Kindle Direct Publishing, Google Play Books and Apple Books all take.

export interface OutlineChapter { n: number; title: string; beats: string }

export interface BookMeta { title: string; subtitle: string; author: string; language: string }

/** "### Chapter 3: The Fall" blocks from the outline, with the bullets under each. */
export function parseOutline(md: string): { meta: Pick<BookMeta, "title" | "subtitle">; chapters: OutlineChapter[] } {
  const lines = md.split("\n");
  const title = lines.find((l) => /^#\s+\S/.test(l))?.replace(/^#\s+/, "").trim() ?? "Untitled";
  const titleAt = lines.findIndex((l) => /^#\s+\S/.test(l));
  const subtitle = titleAt >= 0
    ? (lines.slice(titleAt + 1).find((l) => l.trim())?.trim() ?? "").replace(/^[*_]+|[*_]+$/g, "")
    : "";
  const chapters: OutlineChapter[] = [];
  let cur: OutlineChapter | null = null;
  for (const line of lines) {
    const m = /^#{2,4}\s*Chapter\s+(\d+)\s*[:.—–-]?\s*(.*)$/i.exec(line.trim());
    if (m) {
      cur = { n: Number(m[1]), title: m[2].trim() || `Chapter ${m[1]}`, beats: "" };
      chapters.push(cur);
    } else if (/^#{1,3}\s/.test(line.trim())) {
      cur = null;
    } else if (cur && line.trim()) {
      cur.beats += `${line.trim()}\n`;
    }
  }
  return {
    meta: { title, subtitle: /^#/.test(subtitle) ? "" : subtitle },
    chapters: chapters.map((c) => ({ ...c, beats: c.beats.trim() })),
  };
}

/** How many model calls a chapter of this length takes; each writes about 2,500 words. */
export const PART_WORDS = 2500;
export const partsFor = (words: number) => Math.max(1, Math.ceil(words / PART_WORDS));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>");
}

/** The subset of Markdown a chapter uses — headings, paragraphs, lists, breaks, emphasis — as XHTML. */
export function markdownToXhtml(md: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`); list = []; } };
  for (const block of md.replace(/\r/g, "").split(/\n{2,}/)) {
    const t = block.trim();
    if (!t) continue;
    const lines = t.split("\n");
    if (/^(\*\s*\*\s*\*|-{3,}|#{1,3})$/.test(t)) { flush(); out.push("<hr/>"); continue; }
    if (lines.every((l) => /^[-*]\s+/.test(l))) { list.push(...lines.map((l) => l.replace(/^[-*]\s+/, ""))); continue; }
    flush();
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    const level = h ? Math.min(h[1].length + 1, 4) : 0;
    if (h && lines.length === 1) out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    else out.push(`<p>${lines.map(inline).join("<br/>")}</p>`);
  }
  flush();
  return out.join("\n");
}

// ── ZIP (stored, no compression) — EPUB requires "mimetype" first and uncompressed,
// and storing everything keeps this dependency-free.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const size = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, end];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let at = 0;
  for (const a of all) { out.set(a, at); at += a.length; }
  return out;
}

const page = (title: string, body: string, lang: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
${body}
</body>
</html>`;

const CSS = `body{font-family:serif;line-height:1.5;margin:0 5%}h1,h2{text-align:center;margin:2em 0 1em}p{text-indent:1.2em;margin:0}h1+p,h2+p,hr+p{text-indent:0}hr{border:0;text-align:center;margin:1.5em 0}hr:after{content:"* * *"}.title{text-align:center;margin-top:30%}.title p{text-indent:0}`;

/** A valid EPUB 3: title page, one XHTML file per chapter, nav + NCX for older readers. */
export function buildEpub(meta: BookMeta, chapters: { title: string; text: string }[], id: string): Uint8Array {
  const enc = new TextEncoder();
  const lang = meta.language || "en";
  const files: { name: string; data: Uint8Array }[] = [
    { name: "mimetype", data: enc.encode("application/epub+zip") },
    { name: "META-INF/container.xml", data: enc.encode(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`) },
    { name: "OEBPS/style.css", data: enc.encode(CSS) },
    { name: "OEBPS/title.xhtml", data: enc.encode(page(meta.title, `<div class="title"><h1>${esc(meta.title)}</h1>${meta.subtitle ? `<p>${esc(meta.subtitle)}</p>` : ""}<p>${esc(meta.author)}</p></div>`, lang)) },
  ];
  chapters.forEach((c, i) => {
    files.push({ name: `OEBPS/ch${i + 1}.xhtml`, data: enc.encode(page(c.title, `<h2>${esc(c.title)}</h2>\n${markdownToXhtml(c.text)}`, lang)) });
  });
  const nav = chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${esc(c.title)}</a></li>`).join("\n");
  files.push({ name: "OEBPS/nav.xhtml", data: enc.encode(page("Contents", `<nav epub:type="toc" id="toc"><h2>Contents</h2><ol>\n${nav}\n</ol></nav>`, lang)) });
  files.push({ name: "OEBPS/toc.ncx", data: enc.encode(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(id)}"/></head>
<docTitle><text>${esc(meta.title)}</text></docTitle><navMap>
${chapters.map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="ch${i + 1}.xhtml"/></navPoint>`).join("\n")}
</navMap></ncx>`) });
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  files.push({ name: "OEBPS/content.opf", data: enc.encode(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${esc(id)}</dc:identifier>
<dc:title>${esc(meta.title)}</dc:title>
<dc:creator>${esc(meta.author)}</dc:creator>
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="css" href="style.css" media-type="text/css"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${chapters.map((_, i) => `<item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine toc="ncx">
<itemref idref="title"/>
<itemref idref="nav"/>
${chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join("\n")}
</spine>
</package>`) });
  return zipStore(files);
}
