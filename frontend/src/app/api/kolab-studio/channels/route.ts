// web/app/api/channels/route.ts — link a social channel handle.
// Per PRD §3, linking channels is allowed for signed-in guests (before KYC/subscription),
// so this route requires only authentication — not the feature gate. Real OAuth token exchange
// (and writing oauth_token_enc) is Phase 3 and happens server-side only.
import { getSessionUser } from "@/lib/kolab-studio/db";
import { supabaseServer } from "@/lib/kolab-studio/supabaseServer";
import { channelUpsertSchema } from "@/lib/kolab-studio/validation";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);

    const { platform, handle } = channelUpsertSchema.parse(await req.json());
    const supabase = supabaseServer();

    // Manual handle link (not OAuth): mark connected only when a handle is present.
    const upsert = await supabase.from("channels").upsert(
      {
        user_id: user.id,
        platform,
        handle: handle || null,
        connected: Boolean(handle),
        linked_at: handle ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,platform" },
    );
    if (upsert.error) return fail("Could not link channel", 400);

    await audit({
      actorId: user.id,
      action: "channel.link",
      entity: "channels",
      ip: clientIp(req),
      meta: { platform, linked: Boolean(handle) },
    });
    return ok({ linked: Boolean(handle) });
  } catch (e) {
    return handleError(e);
  }
}
