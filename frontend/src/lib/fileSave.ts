// Files JARVIS writes for the user (a page, a CSV, a script). The browser saves
// them to its download folder (Downloads unless the user chose otherwise) and
// opens them in a new tab. A page runs in a sandboxed frame with an opaque
// origin: model-written HTML must never run with the app's cookies or storage.

export interface SavedFile { filename: string; mime: string; content: string }

export const MAX_FILE_CHARS = 1_000_000;
// Chats persist to localStorage (about 5 MB per site), so only small files
// stay downloadable from history.
export const KEEP_FILE_CHARS = 200_000;

export function forHistory(files: SavedFile[]): SavedFile[] {
  return files.map((f) => (f.content.length > KEEP_FILE_CHARS ? { ...f, content: "" } : f));
}

const EXT: Record<string, string> = {
  "text/html": "html", "text/plain": "txt", "text/csv": "csv", "text/markdown": "md",
  "application/json": "json", "image/svg+xml": "svg", "text/css": "css",
  "text/javascript": "js", "application/javascript": "js", "application/xml": "xml", "text/xml": "xml",
};

export function safeFilename(name: string, mime: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").trim();
  const hasExt = /\.[a-z0-9]{1,8}$/i.test(base);
  const stem = (hasExt ? base.replace(/\.[a-z0-9]{1,8}$/i, "") : base)
    .replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").replace(/^[.-]+/, "") || "file";
  const ext = hasExt ? base.match(/\.([a-z0-9]{1,8})$/i)![1].toLowerCase() : EXT[mime] ?? "txt";
  return `${stem}.${ext}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const renders = (f: SavedFile) => f.mime === "text/html" || f.mime === "image/svg+xml" || /\.(html?|svg)$/i.test(f.filename);

/** The page shown in the new tab: the file in a sandboxed frame, or as plain text. */
export function viewerHtml(f: SavedFile): string {
  const body = renders(f)
    ? `<iframe sandbox="allow-scripts allow-forms allow-modals allow-popups" srcdoc="${esc(f.content)}" style="border:0;width:100vw;height:100vh;display:block"></iframe>`
    : `<pre>${esc(f.content)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(f.filename)}</title><style>body{margin:0;background:#fff}pre{margin:0;padding:16px;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap}</style></head><body>${body}</body></html>`;
}

/** Opens the file in a new tab, model-written HTML inside the sandbox. */
export function openFileTab(f: SavedFile, tab: Window | null = window.open("", "_blank")): boolean {
  if (!tab) return false;
  tab.opener = null;
  tab.document.write(viewerHtml(f));
  tab.document.close();
  return true;
}

/** Saves the file through the browser's download, and opens it in a new tab if asked. */
export function deliverFile(f: SavedFile, { open }: { open: boolean }): { downloaded: boolean; opened: boolean } {
  // Opened before the download so the pop-up still counts as the user's click.
  const tab = open ? window.open("", "_blank") : null;
  const url = URL.createObjectURL(new Blob([f.content], { type: f.mime || "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename(f.filename, f.mime);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { downloaded: true, opened: open && openFileTab(f, tab) };
}
