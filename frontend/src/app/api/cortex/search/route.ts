import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { searchChunks, cortexEnabled } from "@/lib/cortex";

export const runtime = "nodejs";
export const maxDuration = 30;

// Semantic (pgvector) search over the user's ingested documents. Returns
// { enabled: false } when embeddings aren't configured so the client can fall
// back to local keyword search.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);
  if (!cortexEnabled()) return json({ enabled: false, hits: [] });

  const { query } = (await req.json().catch(() => ({}))) as { query?: string };
  const q = (query ?? "").trim();
  if (!q) return json({ enabled: true, hits: [] });

  try {
    const hits = await searchChunks(email, q, 5);
    return json({ enabled: true, hits });
  } catch (e) {
    console.error("cortex search error:", e);
    return json({ error: "Search failed" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
