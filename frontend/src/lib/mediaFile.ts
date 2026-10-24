// A provider URL opened in a new tab is played by the browser. Downloads go
// through a same-origin blob so the saved file has a real extension.

const TYPE_EXT: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
  "audio/flac": "flac", "audio/x-flac": "flac",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a", "audio/aac": "aac", "audio/x-m4a": "m4a",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

const PATH_EXT = new Set(["mp3", "wav", "flac", "ogg", "m4a", "aac", "mp4", "webm", "mov", "png", "jpg", "jpeg", "webp", "gif"]);

export function mediaFilename(name: string, contentType: string | null, path = "", head?: Uint8Array): string {
  const ext = mediaExt(contentType, path, head);
  const base = (name || "download")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^\w -]+/g, "")
    .trim()
    .slice(0, 60)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "download";
  return `${base}.${ext}`;
}

export function mediaExt(contentType: string | null, path = "", head?: Uint8Array): string {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (TYPE_EXT[type]) return TYPE_EXT[type];
  const fromPath = path.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromPath && PATH_EXT.has(fromPath)) return fromPath === "jpeg" ? "jpg" : fromPath;
  const sniffed = head ? sniff(head) : null;
  if (sniffed) return sniffed;
  if (type.startsWith("audio/")) return "mp3";
  if (type.startsWith("video/")) return "mp4";
  if (type.startsWith("image/")) return "png";
  return "bin";
}

function sniff(head: Uint8Array): string | null {
  if (head.length < 4) return null;
  const ascii = (i: number, n: number) => String.fromCharCode(...head.slice(i, i + n));
  if (ascii(0, 4) === "RIFF" && head.length >= 12 && ascii(8, 4) === "WAVE") return "wav";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "mp3";
  if (head.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    return brand === "M4A " || brand.startsWith("M4A") ? "m4a" : "mp4";
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (head[0] === 0x89 && ascii(1, 3) === "PNG") return "png";
  if (head[0] === 0xff && head[1] === 0xd8) return "jpg";
  return null;
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\w.\-]+/g, "") || "download.bin";
  return `attachment; filename="${ascii}"`;
}

const PROVIDER = /(^|\.)replicate\.delivery$|^replicate\.com$|\.supabase\.co$|^storage\.googleapis\.com$/;

export function isProviderMedia(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PROVIDER.test(u.hostname);
  } catch {
    return false;
  }
}

/** Save a remote, blob, or data URL as a file. Never navigates to a player. */
export async function saveMedia(url: string, title = "download"): Promise<void> {
  const local = /^(blob:|data:)/.test(url) || url.startsWith("/");
  const endpoint = local
    ? url
    : `/api/tools/music/proxy?url=${encodeURIComponent(url)}&dl=1&name=${encodeURIComponent(title)}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error("Could not download this file.");
  const blob = await res.blob();
  const named = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1];
  await saveBlob(blob, named || mediaFilename(title, blob.type || res.headers.get("content-type"), url));
}

const onIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * Save a file without leaving the page. On iPhone a download link swaps the
 * whole app for a file preview with no way back, so the share sheet (Save to
 * Files, Save Video) takes it instead.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (onIos() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      // The tap's permission ran out while a large file downloaded: one more tap shares it.
      if (e instanceof Error && e.name === "NotAllowedError") await tapToSave(file);
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

function tapToSave(file: File): Promise<void> {
  return new Promise((resolve) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `Save ${file.name}`;
    b.style.cssText = "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 96px);transform:translateX(-50%);z-index:9999;max-width:90vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:12px 20px;border-radius:12px;border:0;background:var(--color-accent-blue);color:var(--color-bg-base);font:600 14px system-ui;box-shadow:0 0 30px rgba(var(--accent-rgb),0.35)";
    b.onclick = () => { b.remove(); navigator.share({ files: [file] }).catch(() => undefined).finally(resolve); };
    document.body.appendChild(b);
  });
}
