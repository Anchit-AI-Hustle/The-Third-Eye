// web/app/api/studio/schedule/route.ts — Scheduler queue (real publishing is Phase 3).
import { requireFeatureAccess } from "@/lib/kolab-studio/apiGuard";
import { scheduleCreateSchema, idParamSchema } from "@/lib/kolab-studio/validation";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const gate = await requireFeatureAccess();
    if (!gate.ok) return gate.response;
    const input = scheduleCreateSchema.parse(await req.json());

    const scheduledAt =
      input.date && input.time
        ? new Date(`${input.date}T${input.time}:00`).toISOString()
        : input.date
          ? new Date(`${input.date}T00:00:00`).toISOString()
          : null;

    const ins = await gate.supabase.from("scheduled_posts").insert({
      user_id: gate.user.id,
      title: input.title,
      scheduled_at: scheduledAt,
      channels: input.channels,
      publish_status: "queued",
    });
    if (ins.error) return fail("Could not add to queue", 400);
    await audit({ actorId: gate.user.id, action: "studio.schedule.create", ip: clientIp(req), meta: { channels: input.channels.length } });
    return ok({ created: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const gate = await requireFeatureAccess();
    if (!gate.ok) return gate.response;
    const { id } = idParamSchema.parse({ id: new URL(req.url).searchParams.get("id") });
    const del = await gate.supabase.from("scheduled_posts").delete().eq("id", id).eq("user_id", gate.user.id);
    if (del.error) return fail("Could not delete", 400);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
