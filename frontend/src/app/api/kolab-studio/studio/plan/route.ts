// web/app/api/studio/plan/route.ts — Content Calendar items.
//   POST   create one item (or generate a starter week)
//   PATCH  update status / done / notes
//   DELETE remove by ?id=
import { requireFeatureAccess } from "@/lib/kolab-studio/apiGuard";
import { planCreateSchema, planUpdateSchema, planGenerateWeekSchema, idParamSchema } from "@/lib/kolab-studio/validation";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const gate = await requireFeatureAccess();
    if (!gate.ok) return gate.response;
    const body = await req.json();

    // Generate a starter week from the user's pillars (server-built, deterministic).
    if (body?.generate === "week") {
      planGenerateWeekSchema.parse(body);
      const { data: pillars } = await gate.supabase
        .from("content_pillars")
        .select("id")
        .order("sort_order", { ascending: true });
      const pids = ((pillars as { id: string }[] | null) ?? []).map((p) => p.id);
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const fmt = ["Reel · 30s", "Carousel · 6 slides", "Reel · 20s", "Carousel · 5 slides", "Reel · 40s", "Story + Static", "Photo + quote"];
      const asset = ["video", "carousel", "video", "carousel", "video", "photo", "loop"] as const;
      const base = new Date();
      base.setHours(0, 0, 0, 0);
      const rows = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        return {
          user_id: gate.user.id,
          pillar_id: pids.length ? pids[i % pids.length] : null,
          format: fmt[i],
          asset_type: asset[i],
          date: d.toISOString().slice(0, 10),
          time: "19:30",
          hook: `${days[i]} post — edit me`,
          status: "to_shoot" as const,
          done: false,
        };
      });
      const ins = await gate.supabase.from("content_plan").insert(rows);
      if (ins.error) return fail("Could not generate week", 400);
      await audit({ actorId: gate.user.id, action: "studio.plan.generate_week", ip: clientIp(req) });
      return ok({ added: rows.length });
    }

    const input = planCreateSchema.parse(body);
    const ins = await gate.supabase.from("content_plan").insert({
      user_id: gate.user.id,
      pillar_id: input.pillar_id ?? null,
      format: input.format ?? "",
      asset_type: input.asset_type,
      date: input.date ?? null,
      time: input.time ?? null,
      hook: input.hook,
      caption: input.caption ?? null,
      status: "to_shoot",
      done: false,
    });
    if (ins.error) return fail("Could not add to plan", 400);
    await audit({ actorId: gate.user.id, action: "studio.plan.create", ip: clientIp(req) });
    return ok({ created: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const gate = await requireFeatureAccess();
    if (!gate.ok) return gate.response;
    const input = planUpdateSchema.parse(await req.json());

    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === "posted") patch.done = true;
    }
    if (input.done !== undefined) {
      patch.done = input.done;
      // Keep done and status consistent so the checkbox can be undone. The UI derives
      // "done" as (done || status === "posted"), so clearing done must also move status
      // off "posted" — otherwise the item would immediately re-check itself.
      if (input.done) patch.status = "posted";
      else if (input.status === undefined) patch.status = "scheduled";
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    if (Object.keys(patch).length === 0) return fail("Nothing to update", 400);

    // RLS restricts to the owner; scoping by id is also IDOR-safe.
    const upd = await gate.supabase.from("content_plan").update(patch).eq("id", input.id).eq("user_id", gate.user.id);
    if (upd.error) return fail("Could not update item", 400);
    return ok({ updated: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const gate = await requireFeatureAccess();
    if (!gate.ok) return gate.response;
    const { id } = idParamSchema.parse({ id: new URL(req.url).searchParams.get("id") });
    const del = await gate.supabase.from("content_plan").delete().eq("id", id).eq("user_id", gate.user.id);
    if (del.error) return fail("Could not delete item", 400);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
