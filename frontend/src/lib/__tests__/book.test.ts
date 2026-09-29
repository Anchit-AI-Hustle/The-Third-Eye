import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildEpub, crc32, markdownToXhtml, parseOutline, partsFor } from "@/lib/book";

const OUTLINE = `# The Last Signal
*A novel of the long night*

Logline: a radio operator hears her own voice.

## The promise
Stakes.

## Outline
### Chapter 1: Static
- She hears it.
- Nobody believes her.

### Chapter 2 — The Tower
- She climbs.

## Voice
- First person.`;

describe("parseOutline", () => {
  it("finds the title, subtitle and each chapter with its beats, and nothing after the outline", () => {
    const { meta, chapters } = parseOutline(OUTLINE);
    expect(meta).toEqual({ title: "The Last Signal", subtitle: "A novel of the long night" });
    expect(chapters).toEqual([
      { n: 1, title: "Static", beats: "- She hears it.\n- Nobody believes her." },
      { n: 2, title: "The Tower", beats: "- She climbs." },
    ]);
  });
});

describe("partsFor", () => {
  it("splits a long chapter into calls that each fit a function's lifetime", () => {
    expect([1500, 2500, 3500, 5000].map(partsFor)).toEqual([1, 1, 2, 2]);
  });
});

describe("markdownToXhtml", () => {
  it("renders paragraphs, emphasis, lists and scene breaks, escaping everything else", () => {
    const html = markdownToXhtml("She said *no* & **left**.\n\n* * *\n\n- one\n- two\n\n## Part <2>");
    expect(html).toBe("<p>She said <em>no</em> &amp; <strong>left</strong>.</p>\n<hr/>\n<ul><li>one</li><li>two</li></ul>\n<h3>Part &lt;2&gt;</h3>");
  });
});

describe("buildEpub", () => {
  it("uses the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a zip whose first entry is the uncompressed mimetype, and every file checks out", () => {
    const epub = buildEpub({ title: "T & U", subtitle: "", author: "A", language: "en" },
      [{ title: "Chapter 1: Static", text: "Hello *world*." }, { title: "Chapter 2: Tower", text: "Up." }], "urn:uuid:1");
    expect(new TextDecoder().decode(epub.subarray(30, 38))).toBe("mimetype");
    expect(new TextDecoder().decode(epub.subarray(38, 58))).toBe("application/epub+zip");
    const file = path.join(mkdtempSync(path.join(tmpdir(), "epub-")), "b.epub");
    writeFileSync(file, epub);
    let listing = "";
    try { listing = execFileSync("unzip", ["-t", file], { encoding: "utf8" }); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    expect(listing).toContain("No errors detected");
    const opf = execFileSync("unzip", ["-p", file, "OEBPS/content.opf"], { encoding: "utf8" });
    expect(opf).toContain("<dc:title>T &amp; U</dc:title>");
    expect(opf).toContain('<itemref idref="ch2"/>');
  });
});
