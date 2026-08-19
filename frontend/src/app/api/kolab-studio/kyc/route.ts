// web/app/api/kyc/route.ts — Aadhaar eKYC (server-side, consent-gated, provider-abstracted).
// The Aadhaar number never leaves this request or gets stored. On success we persist ONLY
// status + masked last-4 + consent artifact + timestamp with the service-role client, so KYC
// state is server-authoritative and cannot be forged by the client (CLAUDE.md guardrails #2,#3).
import { getSessionUser } from "@/lib/kolab-studio/db";
import { supabaseAdmin } from "@/lib/kolab-studio/supabaseServer";
import { kycInitiateSchema, kycVerifySchema } from "@/lib/kolab-studio/validation";
import { getKycProvider } from "@/lib/kolab-studio/kyc/provider";
import { rateLimit } from "@/lib/kolab-studio/rateLimit";
import { ok, fail, handleError, clientIp } from "@/lib/kolab-studio/http";
import { audit } from "@/lib/kolab-studio/audit";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not authenticated", 401);

    const ip = clientIp(req);
    const rl = rateLimit(`kyc:${user.id}`, 8, 5 * 60_000);
    if (!rl.allowed) return fail("Too many attempts, try again later", 429);

    const raw = await req.json();
    const provider = getKycProvider();
    const admin = supabaseAdmin();

    if (raw.action === "initiate") {
      const { aadhaar } = kycInitiateSchema.parse(raw); // consent:true enforced by schema
      const { referenceId } = await provider.initiate({ aadhaar, consent: true });

      // Record consent + provider reference only. No Aadhaar number.
      await admin.from("consents").insert({
        user_id: user.id,
        type: "kyc",
        granted: true,
        artifact: referenceId,
      });
      await admin
        .from("kyc_verifications")
        .upsert(
          { user_id: user.id, status: "pending", provider: provider.name, provider_reference_id: referenceId },
          { onConflict: "user_id" },
        );

      await audit({ actorId: user.id, action: "kyc.initiate", ip, meta: { provider: provider.name } });
      return ok({ reference_id: referenceId });
    }

    if (raw.action === "verify") {
      const { reference_id, otp } = kycVerifySchema.parse(raw);
      const result = await provider.verify({ referenceId: reference_id, otp });
      if (!result.verified) {
        await audit({ actorId: user.id, action: "kyc.verify.fail", ip });
        return fail("Verification failed", 401);
      }

      await admin
        .from("kyc_verifications")
        .upsert(
          {
            user_id: user.id,
            status: "verified",
            provider: provider.name,
            provider_reference_id: reference_id,
            aadhaar_last4: result.aadhaarLast4 ?? null,
            consent_artifact_id: result.consentArtifactId ?? null,
            verified_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      await audit({ actorId: user.id, action: "kyc.verify.ok", ip, meta: { provider: provider.name } });
      return ok({ verified: true });
    }

    return fail("Unknown action", 400);
  } catch (e) {
    if (e instanceof Error && e.message.includes("not configured")) {
      return fail(e.message, 501);
    }
    return handleError(e);
  }
}
