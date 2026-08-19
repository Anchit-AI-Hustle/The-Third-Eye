// web/app/api/studio/pillars/route.ts — Strategy pillars (save with ID preservation).
// Existing pillars are updated in place so their ids survive; only pillars the user actually
// removed are deleted. This keeps content_plan.pillar_id (ON DELETE SET NULL) links intact —
// editing a label or role no longer detaches every planned post from its pillar.
import { requireFeatureAccess } from "@/lib/kolab-studio/apiGuard";
import { pillarsBulkSchema } from "@/lib/kolab-studio/validation";
import { pillarColor } from "@/lib/kolab-studio/studioHelpers";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function PUT(req: Request) {
  try {
    const gate = await requireFeatureAccess();
    if (!gate.ok) return gate.response;

    const { pillars } = pillarsBulkSchema.parse(await req.json());
    const keptIds = pillars.map((p) => p.id).filter((id): id is string => Boolean(id));

    // 1) Delete only the pillars the user removed (never touch the ones being kept).
    let del = gate.supabase.from("content_pillars").delete().eq("user_id", gate.user.id);
    if (keptIds.length) del = del.not("id", "in", `(${keptIds.join(",")})`);
    const delRes = await del;
    if (delRes.error) return fail("Could not save pillars", 400);

    // 2) Update existing pillars in place (id preserved → plan links preserved).
    for (let i = 0; i < pillars.length; i++) {
      const p = pillars[i];
      if (!p.id) continue;
      const upd = await gate.supabase
        .from("content_pillars")
        .update({ name: p.name, role: p.role ?? "", color: pillarColor(i), sort_order: i })
        .eq("id", p.id)
        .eq("user_id", gate.user.id);
      if (upd.error) return fail("Could not save pillars", 400);
    }

    // 3) Insert brand-new pillars (no id) — let the DB assign the id.
    const newRows = pillars
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.id)
      .map(({ p, i }) => ({
        user_id: gate.user.id,
        name: p.name,
        role: p.role ?? "",
        color: pillarColor(i),
        sort_order: i,
      }));
    if (newRows.length) {
      const ins = await gate.supabase.from("content_pillars").insert(newRows);
      if (ins.error) return fail("Could not save pillars", 400);
    }

    await audit({
      actorId: gate.user.id,
      action: "studio.pillars.save",
      entity: "content_pillars",
      ip: clientIp(req),
      meta: { count: pillars.length },
    });
    return ok({ count: pillars.length });
  } catch (e) {
    return handleError(e);
  }
}
