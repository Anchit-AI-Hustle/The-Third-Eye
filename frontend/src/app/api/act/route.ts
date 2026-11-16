import type { NextRequest } from "next/server";
import { identify } from "@/lib/serverIdentity";
import { isSensitive } from "@/lib/actions";
import { runConfirmedAction } from "@/lib/confirmedActions";
import { getDb } from "@/lib/db";
import { validActionProof } from "@/lib/actionIdentity";

export const runtime = "nodejs";
export const maxDuration = 120;

// Executes a single user-confirmed action, exactly as it was shown for approval.
export async function POST(req: NextRequest) {
  // A browser session, or the scoped token WhatsApp acts with when the user replies YES.
  const { email } = await identify(req.headers, "chat");
  if (!email) return json({ error: "Not authenticated" }, 401);
  const { tool, args, actionId, proof } = (await req.json().catch(() => ({}))) as { tool?: string; args?: any; actionId?: string; proof?: string };
  if (!tool || !isSensitive(tool, args)) return json({ error: "Unknown or non-confirmable action" }, 400);

  const id = typeof actionId === "string" && /^[\w:.-]{8,100}$/.test(actionId) ? actionId : null;
  if (!id || !validActionProof(proof, email, id, tool, args)) return json({ error: "This confirmation does not match the reviewed action or has expired. Nothing was run. Ask for a new confirmation." }, 400);
  const db = getDb();
  if (!db && process.env.NODE_ENV !== "test") return json({ error: "Confirmations cannot be recorded, so nothing was run." }, 503);
  const claim = db ? { db, id } : null;
  if (claim) {
    const { error } = await db!.from("processed_messages").insert({ user_id: email, source: "act", message_id: id });
    if (error) {
      const dup = (error as { code?: string }).code === "23505";
      return json({ ok: false, duplicate: dup, error: dup
        ? "This confirmation was already used, so it was not run again. Its outcome is unknown here if the first response was lost. Check the destination before requesting a new action."
        : "Could not record this confirmation, so nothing was run." }, dup ? 409 : 503);
    }
  }
  let out;
  try {
    out = await runConfirmedAction(email, tool, args);
  } catch {
    // The action may or may not have happened. Keep the claim so a retry cannot repeat it.
    return json({ ok: false, unknownOutcome: true, error: "The action stopped part-way and its outcome is unknown. It was not retried. Check the destination before asking me to do it again." }, 500);
  }
  // Keep claims even on failures: a partial write may have occurred. A new card is a new decision.
  return out.error ? json({ error: out.error }, 400) : json(out);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
