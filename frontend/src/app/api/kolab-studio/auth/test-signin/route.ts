// web/app/api/auth/test-signin/route.ts
// KOLAB_DEV_MODE-ONLY test sign-in (no OTP). Hard-disabled in production: if KOLAB_DEV_MODE !==
// true it returns 404 as though the route does not exist. Provisions a deterministic dev user
// with the service-role key and returns a one-time email OTP the client verifies immediately.
import { z } from "zod";
import { env } from "@/lib/kolab-studio/env";
import { supabaseAdmin } from "@/lib/kolab-studio/supabaseServer";
import { normalizePhone } from "@/lib/kolab-studio/privileged";
import { rateLimit } from "@/lib/kolab-studio/rateLimit";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

const schema = z.object({ phone: z.string().trim().min(1).max(20) });

export async function POST(req: Request) {
  if (!env.devMode() || env.isProduction()) {
    return fail("Not found", 404);
  }
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`test-signin:${ip}`, 10, 60_000);
    if (!rl.allowed) return fail("Too many attempts, slow down", 429);

    const { phone } = schema.parse(await req.json());
    const norm = normalizePhone(phone);
    if (norm.length < 6) return fail("Enter a valid number", 400);

    const email = `dev-${norm}@kolab.test`;
    const admin = supabaseAdmin();

    // Ensure the dev user exists (store the phone so privileged provisioning can key on it).
    let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) {
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        phone: `+${norm}`,
        user_metadata: { phone: norm, dev: true },
      });
      link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    }
    if (link.error || !link.data?.properties?.email_otp) {
      return fail("Could not create dev session", 500);
    }

    await audit({ actorId: null, action: "auth.test_signin", ip, meta: { dev: true } });
    return ok({ email, token: link.data.properties.email_otp });
  } catch (e) {
    return handleError(e);
  }
}
