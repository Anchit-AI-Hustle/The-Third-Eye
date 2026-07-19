import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same-origin media proxy for generated audio. The video visualizer needs to run
// the track through Web Audio (analyser), which taints on cross-origin sources
// without CORS — so we stream the (allowlisted) provider URL through here.
const ALLOWED_HOSTS = [
  "replicate.delivery", "replicate.com", "pbxt.replicate.delivery",
  "supabase.co", "supabase.in", "storage.googleapis.com",
];

function allowed(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return u.protocol === "https:" && ALLOWED_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new Response("Not authenticated", { status: 401 });

  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return new Response("url required", { status: 400 });
  let target: URL;
  try { target = new URL(raw); } catch { return new Response("invalid url", { status: 400 }); }
  if (!allowed(target)) return new Response("host not allowed", { status: 403 });

  const upstream = await fetch(target.toString());
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
