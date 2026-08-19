// web/app/api/studio/deals/route.ts — Brand Deals / coupons (feed the storefront).
import { requireFeatureAccess } from "@/lib/kolab-studio/apiGuard";
import { dealCreateSchema, idParamSchema } from "@/lib/kolab-studio/validation";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const gate = await requireFeatureAccess();
    if (!gate.ok) return gate.response;
    const d = dealCreateSchema.parse(await req.json());
    const ins = await gate.supabase.from("deals").insert({
      user_id: gate.user.id,
      brand: d.brand ?? "",
      emoji: d.emoji ?? "",
      product: d.product ?? "",
      category: d.category ?? "",
      code: d.code ?? "",
      discount: d.discount ?? "",
      price: d.price ?? "",
      affiliate_url: d.affiliate_url || null,
      active: true,
    });
    if (ins.error) return fail("Could not add deal", 400);
    await audit({ actorId: gate.user.id, action: "studio.deal.create", ip: clientIp(req) });
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
    const del = await gate.supabase.from("deals").delete().eq("id", id).eq("user_id", gate.user.id);
    if (del.error) return fail("Could not delete deal", 400);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
