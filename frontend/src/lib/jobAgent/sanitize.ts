// Dependency-free HTML sanitizer for untrusted job descriptions. We keep a
// small allowlist of formatting tags and strip everything dangerous (scripts,
// event handlers, styles, iframes, unsafe URLs). This is intentionally
// conservative — job descriptions only need basic formatting.

const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h1", "h2", "h3",
  "h4", "h5", "h6", "blockquote", "a", "span", "div", "hr", "table", "thead",
  "tbody", "tr", "td", "th", "code", "pre",
]);

/** Strip scripts/handlers/unsafe tags; keep a small formatting allowlist. */
export function sanitizeHtml(input: string | undefined | null): string {
  if (!input) return "";
  let html = String(input);
  // Remove script/style/iframe/object/embed blocks entirely (with content).
  html = html.replace(/<\s*(script|style|iframe|object|embed|noscript|template)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // Remove comments.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  // Process remaining tags.
  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const closing = /^<\s*\//.test(match);
    if (closing) return `</${tag}>`;
    // Keep only href on <a>, drop all other attributes, and validate the URL.
    if (tag === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const url = href ? (href[2] ?? href[3] ?? href[4] ?? "") : "";
      if (url && /^https?:\/\//i.test(url) && !/["'<>]/.test(url)) {
        return `<a href="${url}" rel="noopener noreferrer nofollow" target="_blank">`;
      }
      return "<a>";
    }
    return `<${tag}>`;
  });
  return html.trim();
}

/** Plain text for AI processing / previews — strips ALL tags and normalizes ws. */
export function htmlToText(input: string | undefined | null): string {
  if (!input) return "";
  return String(input)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
