// web/app/api/billing/subscribe/route.ts — subscription entry point.
// Phase 1: no Razorpay yet. Per SECURITY.md §7 the payment webhook is the SOURCE OF TRUTH for
// subscription state — we must NEVER flip a plan to "active" from a client request in production.
// So in production this returns 501 (checkout wiring is Phase 2). In KOLAB_DEV_MODE only, it
// activates the plan server-side so the unlocked-features UX can be exercised locally.
import { getSessionUser } from "@/lib/kolab-studio/db";
import { supabaseAdmin } from "@/lib/kolab-studio/supabaseServer";
import { subscribeSchema } from "@/lib/kolab-studio/validation";
import { env } from "@/lib/kolab-studio/env";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);

    const { plan, cycle } = subscribeSchema.parse(await req.json());

    if (!env.devMode()) {
      // Real flow (Phase 2): create a Razorpay subscription, redirect to checkout, and let the
      // signature-verified webhook mark the subscription active. Never trust this route to activate.
      return fail(
        "Checkout isn't wired yet (Phase 2 — Razorpay). Subscription state will be set by the payment webhook.",
        501,
      );
    }

    // KOLAB_DEV_MODE demo activation — server-side, not client-trusted state.
    const admin = supabaseAdmin();
    const { error } = await admin
      .from("subscriptions")
      .upsert({ user_id: user.id, plan, cycle, status: "active" }, { onConflict: "user_id" });
    if (error) return fail("Could not update subscription", 400);

    await audit({
      actorId: user.id,
      action: "billing.subscribe.dev",
      ip: clientIp(req),
      meta: { plan, cycle },
    });
    return ok({ message: `${plan} activated (DEV_MODE — real billing via Razorpay in Phase 2)` });
  } catch (e) {
    return handleError(e);
  }
}
