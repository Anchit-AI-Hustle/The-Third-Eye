// web/lib/audit.ts
// Append-only audit trail writer (SECURITY.md §6, §10). Records security-relevant events;
// NEVER logs secrets or PII in `meta` — only ids, action names, and safe flags.
import { supabaseAdmin } from "./supabaseServer";

export interface AuditEvent {
  actorId: string | null;
  action: string; // e.g. "auth.otp.verify", "kyc.initiate", "billing.subscribe"
  entity?: string;
  entityId?: string | null;
  ip?: string;
  ua?: string;
  meta?: Record<string, unknown>; // safe, non-PII only
}

export async function audit(ev: AuditEvent): Promise<void> {
  try {
    const admin = supabaseAdmin();
    await admin.from("audit_log").insert({
      actor_id: ev.actorId,
      action: ev.action,
      entity: ev.entity ?? null,
      entity_id: ev.entityId ?? null,
      ip: ev.ip ?? null,
      ua: ev.ua ?? null,
      meta: ev.meta ?? {},
    });
  } catch {
    // Auditing must never break the request path; surface via server logs only.
    // (In production, forward to a durable log pipeline here.)
    console.error("[audit] failed to write event", ev.action);
  }
}
