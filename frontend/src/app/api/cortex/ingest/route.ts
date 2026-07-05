import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { ingestDocument, deleteDocument, cortexEnabled } from "@/lib/cortex";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);
  if (!cortexEnabled()) return json({ ok: false, chunks: 0, reason: "embeddings_unconfigured" });

  const { docId, title, content } = (await req.json().catch(() => ({}))) as
    { docId?: string; title?: string; content?: string };
  if (!docId || !content) return json({ error: "docId and content required" }, 400);

  const { chunks } = await ingestDocument(email, docId, title ?? "Untitled", content);
  return json({ ok: true, chunks });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);
  const docId = new URL(req.url).searchParams.get("docId");
  if (!docId) return json({ error: "docId required" }, 400);
  await deleteDocument(email, docId);
  return json({ ok: true });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
