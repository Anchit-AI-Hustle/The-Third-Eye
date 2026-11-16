import type { NextRequest } from "next/server";
import { identify } from "@/lib/serverIdentity";
import { isSensitive } from "@/lib/actions";
import { runConfirmedAction } from "@/lib/confirmedActions";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

// Executes a single user-confirmed action, exactly as it was shown for approval.
export async function POST(req: NextRequest) {
  // A browser session, or the scoped token WhatsApp acts with when the user replies YES.
  const { email } = await identify(req.headers, "chat");
  if (!email) return json({ error: "Not authenticated" }, 401);
  const { tool, args, actionId } = (await req.json().catch(() => ({}))) as { tool?: string; args?: any; actionId?: string };
  if (!tool || !isSensitive(tool, args)) return json({ error: "Unknown or non-confirmable action" }, 400);

  // One confirmation = one run. The id the browser made for this confirmation is claimed in the
  // database before anything is sent; a second request with the same id (double tap, network retry
  // after a lost response) finds the claim and does nothing. Claim = unique-key insert, so two
  // simultaneous requests cannot both win.
  const db = getDb();
  const id = typeof actionId === "string" && /^[\w:.-]{8,100}$/.test(actionId) ? actionId : null;
  const claim = db && id ? { db, id } : null;
  if (claim) {
    const { error } = await claim.db.from("processed_messages").insert({ user_id: email, source: "act", message_id: claim.id });
    if (error) {
      const dup = (error as { code?: string }).code === "23505" || /duplicate|unique/i.test(String((error as { message?: string }).message ?? ""));
      if (dup) return json({ ok: false, duplicate: true, error: "This confirmation was already used, so it was not run again. If the first attempt's result never reached you, its outcome is unknown here: check the destination (for example your Sent folder) before asking me to do it again." }, 409);
      return json({ error: "Could not record this confirmation, so nothing was run. Try again." }, 503);
    }
  }
  let out;
  try {
    out = await runConfirmedAction(email, tool, args);
  } catch {
    // The action may or may not have happened. Keep the claim so a retry cannot repeat it.
    return json({ ok: false, unknownOutcome: true, error: "The action stopped part-way and its outcome is unknown. It was not retried. Check the destination before asking me to do it again." }, 500);
  }
  // Only a refusal that is known to have done nothing frees the id (mail with no Google token, a
  // premium gate, a routine that did not validate). For every other tool a failed result may have
  // partly happened (posts, app builds, connector calls), so the id stays used and the user starts a
  // fresh request after checking.
  const cleanRefusal = !out.unknownOutcome && (out.error || out.ok === false) && ["communicate", "send_email", "manage_routines"].includes(tool);
  if (claim && cleanRefusal) await claim.db.from("processed_messages").delete().eq("user_id", email).eq("source", "act").eq("message_id", claim.id);
  return out.error ? json({ error: out.error }, 400) : json(out);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
