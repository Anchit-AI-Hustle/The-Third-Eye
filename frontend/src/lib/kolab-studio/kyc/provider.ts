// web/lib/kyc/provider.ts
// KYC provider ABSTRACTION so Phase 2 can drop in a UIDAI-licensed provider (Digio/Signzy/
// Cashfree/IDfy) — via supabase/functions/aadhaar-kyc — without touching call sites.
//
// HARD RULES (SECURITY.md §4): the Aadhaar number is used ONLY transiently to initiate the
// provider OTP; it is NEVER returned by, or stored from, these functions. We keep only:
// status, provider reference_id, masked last-4, consent artifact id, timestamps.
import "server-only";

export interface KycInitiateResult {
  referenceId: string;
}

export interface KycVerifyResult {
  verified: boolean;
  // Demographics the provider returns on success; used to pre-fill the profile (user confirms).
  name?: string;
  dob?: string;
  aadhaarLast4?: string; // display only
  consentArtifactId?: string;
}

export interface KycProvider {
  readonly name: string;
  /** Trigger the UIDAI OTP via the provider. Returns a reference; the Aadhaar number is not retained. */
  initiate(input: { aadhaar: string; consent: true }): Promise<KycInitiateResult>;
  /** Exchange reference + OTP for the verified eKYC result. */
  verify(input: { referenceId: string; otp: string }): Promise<KycVerifyResult>;
}

/** Phase-1 stub: not a real verification. Refuses to "succeed" so no fake KYC state is created
 *  unless KOLAB_DEV_MODE is on (for local demos). Real provider wiring lands in Phase 2. */
class StubKycProvider implements KycProvider {
  readonly name = "stub";
  async initiate(): Promise<KycInitiateResult> {
    return { referenceId: `stub_${crypto.randomUUID()}` };
  }
  async verify({ otp }: { referenceId: string; otp: string }): Promise<KycVerifyResult> {
    const devMode = (process.env.KOLAB_DEV_MODE ?? "false").toLowerCase() === "true";
    if (!devMode) {
      throw new Error("KYC provider not configured (Phase 2). Set KYC_PROVIDER_* and enable the adapter.");
    }
    // DEV only: accept any 6-digit code to exercise the unlocked-features UX.
    if (!/^\d{4,8}$/.test(otp)) return { verified: false };
    return { verified: true, aadhaarLast4: "0000", consentArtifactId: `dev_${crypto.randomUUID()}` };
  }
}

export function getKycProvider(): KycProvider {
  // Phase 2: switch on process.env.KYC_PROVIDER and return the licensed adapter.
  return new StubKycProvider();
}
