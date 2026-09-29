import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { anchorOverview, runAnchor, type AnchorRequest } from "@/lib/anchor";

export const runtime = "nodejs";

// ANCHOR Autopilot in Jarvis: GET the robot's state, POST to start one of its
// workflows (operators only — see lib/anchor.ts).

async function user() {
  return (await getServerSession(authOptions))?.user?.email ?? null;
}

export async function GET() {
  const u = await user();
  if (!u) return Response.json({ error: "Not authenticated" }, { status: 401 });
  try {
    return Response.json(await anchorOverview(u));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "ANCHOR is unreachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const u = await user();
  if (!u) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as AnchorRequest | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const out = await runAnchor(u, body);
  return Response.json(out, { status: out.ok ? 200 : 400 });
}
