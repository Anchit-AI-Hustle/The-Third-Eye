import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ANCHOR_REPO } from "@/lib/anchor";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same-origin media proxy for generated audio and video. The music visualizer
// runs tracks through Web Audio, and the Video Studio episode assembler draws
// clips to a canvas and decodes voice-overs — both taint or fail on cross-origin
// sources, so the (allowlisted) provider URL is streamed through here.
//
// SSRF-safe: the host must be an EXACT match in the allowlist, and the URL we
// fetch is rebuilt from the vetted host + path only — no raw user string ever
// reaches fetch(), and the origin can't be redirected off the allowlist.
const ALLOWED_HOSTS = new Set([
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "replicate.com",
  "hlcjghpzxzatgjfwcoav.supabase.co",
  "cnbxarfuyicyjbtvbmtv.supabase.co",
  "storage.googleapis.com",
]);

// ANCHOR's released masters, for a reel's soundtrack: only that repo's release
// downloads on github.com, which answer with a redirect to GitHub's asset host.
const releasePath = (path: string) => path.toLowerCase().startsWith(`/${ANCHOR_REPO.toLowerCase()}/releases/download/`);
const ASSET_HOSTS = new Set(["objects.githubusercontent.com", "release-assets.githubusercontent.com"]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new Response("Not authenticated", { status: 401 });

  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return new Response("url required", { status: 400 });
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return new Response("invalid url", { status: 400 }); }
  const release = parsed.hostname === "github.com" && releasePath(parsed.pathname);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !(ALLOWED_HOSTS.has(parsed.hostname) || release)) {
    return new Response("host not allowed", { status: 403 });
  }

  // Rebuild from vetted host + path/query only (defence in depth vs SSRF).
  const safe = `https://${parsed.hostname}${parsed.pathname}${parsed.search}`;
  let upstream = await fetch(safe, { redirect: release ? "manual" : "error" }).catch(() => null);
  if (release && upstream && upstream.status >= 300 && upstream.status < 400) {
    let next: URL | null = null;
    try { next = new URL(upstream.headers.get("location") ?? ""); } catch { /* refused below */ }
    if (!next || next.protocol !== "https:" || !ASSET_HOSTS.has(next.hostname)) return new Response("redirect not allowed", { status: 502 });
    upstream = await fetch(`https://${next.hostname}${next.pathname}${next.search}`, { redirect: "error" }).catch(() => null);
  }
  if (!upstream?.ok || !upstream.body) return new Response("upstream error", { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
