import type { CoverLetterDocument, ResumeDocument, ResumeSection } from "./types";

// Render the ONE canonical document model to preview HTML, print-ready HTML
// (selectable text, single column, standard headings — ATS-safe), Markdown, and
// plain text. Preview and export share this so they never diverge.

function esc(s: string | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dateRange(start?: string, end?: string): string {
  if (!start && !end) return "";
  return `${start || ""}${start && (end || "Present") ? " – " : ""}${end || "Present"}`;
}

function sectionToHtml(s: ResumeSection): string {
  if (!s.visible) return "";
  const head = `<h2>${esc(s.label)}</h2>`;
  if (s.kind === "summary") return s.text ? `${head}<p>${esc(s.text)}</p>` : "";
  if (s.kind === "skills" || s.kind === "languages") {
    return s.items?.length ? `${head}<p>${s.items.map(esc).join(" · ")}</p>` : "";
  }
  const entries = (s.entries || [])
    .map((e) => {
      const line1 = [esc(e.title), esc(e.org)].filter(Boolean).join(" — ");
      const meta = [esc(e.location), dateRange(e.startDate, e.endDate)].filter(Boolean).join(" | ");
      const bullets = (e.bullets || []).filter((b) => b.text).map((b) => `<li>${esc(b.text)}</li>`).join("");
      return `<div class="entry"><div class="entry-head"><span class="entry-title">${line1}</span>${meta ? `<span class="entry-meta">${meta}</span>` : ""}</div>${e.summary ? `<p>${esc(e.summary)}</p>` : ""}${bullets ? `<ul>${bullets}</ul>` : ""}</div>`;
    })
    .join("");
  return entries ? `${head}${entries}` : "";
}

const PRINT_CSS = `
*{box-sizing:border-box}
body{font-family:Georgia,'Times New Roman',serif;color:#111;line-height:1.4;max-width:760px;margin:0 auto;padding:32px;font-size:11pt}
h1{font-size:20pt;margin:0 0 2px}
.headline{font-size:11pt;color:#333;margin:0 0 6px}
.contact{font-size:9.5pt;color:#333;margin:0 0 14px}
.contact a{color:#111;text-decoration:none}
h2{font-size:11.5pt;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #999;padding-bottom:2px;margin:16px 0 8px}
.entry{margin:0 0 10px}
.entry-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.entry-title{font-weight:bold}
.entry-meta{color:#444;font-size:9.5pt;white-space:nowrap}
ul{margin:4px 0 0;padding-left:18px}
li{margin:0 0 3px}
p{margin:4px 0}
@media print{body{padding:0}}
`;

export function resumeToHtml(doc: ResumeDocument, opts: { forPrint?: boolean } = {}): string {
  const c = doc.contact;
  const contactLine = [c.email, c.phone, c.location, ...(c.links || []).map((l) => l.url)].filter(Boolean).map(esc).join("  ·  ");
  const body = `
    <h1>${esc(c.fullName)}</h1>
    ${c.headline ? `<div class="headline">${esc(c.headline)}</div>` : ""}
    <div class="contact">${contactLine}</div>
    ${doc.sections.map(sectionToHtml).join("")}
  `;
  if (!opts.forPrint) return body;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.fullName)} — Resume</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
}

export function resumeToMarkdown(doc: ResumeDocument): string {
  const c = doc.contact;
  const lines: string[] = [`# ${c.fullName}`];
  if (c.headline) lines.push(`*${c.headline}*`);
  lines.push([c.email, c.phone, c.location].filter(Boolean).join(" · "));
  (c.links || []).forEach((l) => lines.push(`${l.label}: ${l.url}`));
  for (const s of doc.sections) {
    if (!s.visible) continue;
    if (s.kind === "summary" && s.text) { lines.push(`\n## ${s.label}\n`, s.text); continue; }
    if ((s.kind === "skills" || s.kind === "languages") && s.items?.length) { lines.push(`\n## ${s.label}\n`, s.items.join(" · ")); continue; }
    if (s.entries?.length) {
      lines.push(`\n## ${s.label}`);
      for (const e of s.entries) {
        lines.push(`\n**${[e.title, e.org].filter(Boolean).join(" — ")}** ${dateRange(e.startDate, e.endDate)}`.trim());
        if (e.location) lines.push(`_${e.location}_`);
        if (e.summary) lines.push(e.summary);
        (e.bullets || []).filter((b) => b.text).forEach((b) => lines.push(`- ${b.text}`));
      }
    }
  }
  return lines.join("\n");
}

export function resumeToText(doc: ResumeDocument): string {
  return resumeToMarkdown(doc).replace(/[#*_]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function coverLetterToHtml(doc: CoverLetterDocument, opts: { forPrint?: boolean } = {}): string {
  const body = `
    <p>${esc(doc.greeting)}</p>
    ${doc.paragraphs.map((p) => `<p>${esc(p.text)}</p>`).join("")}
    <p>${esc(doc.closing)}<br>${esc(doc.signature || "")}</p>
  `;
  if (!opts.forPrint) return body;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cover Letter</title><style>${PRINT_CSS}</style></head><body style="font-size:11.5pt">${body}</body></html>`;
}

export function coverLetterToText(doc: CoverLetterDocument): string {
  return [doc.greeting, "", ...doc.paragraphs.map((p) => p.text), "", doc.closing, doc.signature || ""].join("\n").trim();
}
