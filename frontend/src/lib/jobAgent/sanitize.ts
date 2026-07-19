// Job descriptions arrive as untrusted HTML. We never render that HTML — the UI
// only ever shows the PLAIN TEXT extracted here (and the AI receives plain text
// too). So instead of a fragile regex "HTML sanitizer" (which CodeQL correctly
// flags as bypassable + ReDoS-prone), we fully strip to text with linear,
// non-backtracking scans and a single-pass entity decode.

/** Remove <tag>…</tag> blocks (e.g. script/style) using linear indexOf scans —
 *  no regex backtracking, and nested/overlapping tags can't reintroduce a block. */
function stripBlocks(input: string, tags: string[]): string {
  let s = input;
  for (const tag of tags) {
    let out = "";
    let i = 0;
    const openTok = `<${tag}`;
    const closeTok = `</${tag}`;
    // Re-lowercase each pass; indices align because case-folding preserves length.
    let lower = s.toLowerCase();
    while (true) {
      const open = lower.indexOf(openTok, i);
      if (open === -1) { out += s.slice(i); break; }
      out += s.slice(i, open);
      const close = lower.indexOf(closeTok, open + openTok.length);
      if (close === -1) break; // unterminated → drop the remainder
      const gt = lower.indexOf(">", close);
      i = gt === -1 ? s.length : gt + 1;
    }
    s = out;
    lower = "";
  }
  return s;
}

/** Single-pass entity decode. `&amp;` is decoded LAST so a decoded value can't
 *  re-form another entity (avoids the double-unescape class). */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** Untrusted HTML → clean plain text. Linear, ReDoS-safe, no HTML output. */
export function htmlToText(input: string | undefined | null): string {
  if (!input) return "";
  let s = stripBlocks(String(input), ["script", "style", "iframe", "noscript", "template"]);
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " "); // strip any remaining tags ([^>]* is linear)
  s = decodeEntities(s);
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
