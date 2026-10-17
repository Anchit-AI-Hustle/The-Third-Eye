import type { NextRequest } from "next/server";
import { identify } from "@/lib/serverIdentity";
import { isSensitive } from "@/lib/actions";
import { runConfirmedAction } from "@/lib/confirmedActions";

export const runtime = "nodejs";
export const maxDuration = 120;

// Executes a single user-confirmed action, exactly as it was shown for approval.
export async function POST(req: NextRequest) {
  // A browser session, or the scoped token WhatsApp acts with when the user replies YES.
  const { email } = await identify(req.headers, "chat");
  if (!email) return json({ error: "Not authenticated" }, 401);
  const { tool, args } = (await req.json().catch(() => ({}))) as { tool?: string; args?: any };
  if (!tool || !isSensitive(tool, args)) return json({ error: "Unknown or non-confirmable action" }, 400);
  const out = await runConfirmedAction(email, tool, args);
  return out.error ? json({ error: out.error }, 400) : json(out);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
