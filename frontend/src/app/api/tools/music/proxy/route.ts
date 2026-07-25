import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same-origin media proxy for generated audio. The video visualizer runs the
// track through Web Audio (analyser), which taints on cross-origin sources — so
// we stream the (allowlisted) provider URL through here.
//
// SSRF-safe: the host must be an EXACT match in the allowlist, and the URL we
// fetch is rebuilt from the vetted host + path only — no raw user string ever
// reaches fetch(), and the origin can't be redirected off the allowlist.
const ALLOWED_HOSTS = new Set([
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "replicate.com",
  "cnbxarfuyicyjbtvbmtv.supabase.co",
  "storage.googleapis.com",
]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new Response("Not authenticated", { status: 401 });

  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return new Response("url required", { status: 400 });
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return new Response("invalid url", { status: 400 }); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  // Rebuild from vetted host + path/query only (defence in depth vs SSRF).
  const safe = `https://${parsed.hostname}${parsed.pathname}${parsed.search}`;
  const upstream = await fetch(safe, { redirect: "error" });
  if (!upstream.ok || !upstream.body) return new Response("upstream error", { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
