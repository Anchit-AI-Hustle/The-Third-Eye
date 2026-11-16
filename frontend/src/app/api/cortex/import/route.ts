import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { cortexEnabled, rememberBackground } from "@/lib/cortex";

export const runtime = "nodejs";
export const maxDuration = 60;

// One batch of background pieces from the user's own exported history.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!cortexEnabled()) return Response.json({ error: "Memory is not set up on this server." }, { status: 503 });
  const { pieces } = (await req.json().catch(() => ({}))) as { pieces?: unknown };
  if (!Array.isArray(pieces) || !pieces.length) return Response.json({ error: "pieces required" }, { status: 400 });
  const saved = await rememberBackground(email, pieces.filter((p): p is string => typeof p === "string"));
  return Response.json({ saved });
}
