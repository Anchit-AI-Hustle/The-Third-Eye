import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cortexEnabled, ingestDocument } from "@/lib/cortex";
import { knowledgeDocFrom } from "@/lib/knowledgeFile";

export const runtime = "nodejs";
export const maxDuration = 60;

// Files from the native apps' Knowledge screen, read here the same way the
// website reads them in the browser (lib/knowledgeFile), then saved for the
// signed-in account. Vercel refuses request bodies over 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "Storage not configured" }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) {
    return Response.json({ error: "That's over 4 MB. Upload a smaller file, or split it." }, { status: 413 });
  }

  const docs = await Promise.all(files.map(async (f) => knowledgeDocFrom(f.name, new Uint8Array(await f.arrayBuffer()), f.type)));
  const { error } = await db.from("knowledge_docs").insert(docs.map((d) => ({ ...d, user_id: email })));
  if (error) return Response.json({ error: "Couldn't save the document. Try again." }, { status: 500 });

  // Semantic search (best-effort): a document is saved even when embedding fails.
  if (cortexEnabled()) {
    await Promise.all(docs.filter((d) => d.processing_status === "ready" && d.content)
      .map((d) => ingestDocument(email, d.id, d.title, d.content).catch(() => null)));
  }
  return Response.json({ docs });
}
