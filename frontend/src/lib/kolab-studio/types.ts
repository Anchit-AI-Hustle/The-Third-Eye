// web/lib/types.ts
// Row types mirroring docs/DATA-MODEL.md. These describe the SERVER-side shape;
// sensitive columns (address_enc, oauth_token_enc) are never sent to the browser.

export type Role = "creator" | "brand" | "admin";
export type KycStatus = "pending" | "verified" | "failed";
export type Plan = "basic" | "pro" | "brand_starter" | "brand_growth" | "brand_scale";
export type Cycle = "monthly" | "annual" | "complimentary";
export type SubStatus = "active" | "past_due" | "canceled";
export type Platform = "instagram" | "youtube" | "facebook" | "tiktok" | "google";
export type AssetType = "video" | "carousel" | "photo" | "loop";
export type PlanStatus = "to_shoot" | "shot" | "edited" | "scheduled" | "posted";
export type PublishStatus = "queued" | "publishing" | "published" | "failed";

export interface Profile {
  user_id: string;
  name: string | null;
  handle: string | null;
  dob: string | null; // ISO date; age derived, never stored
  avatar_path: string | null;
  pincode: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  website_url: string | null;
  influencer_bio: string | null;
  is_complete: boolean;
  privileged: boolean;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface KycVerification {
  user_id: string;
  status: KycStatus;
  provider: string | null;
  provider_reference_id: string | null;
  aadhaar_last4: string | null; // display only; never the full number
  consent_artifact_id: string | null;
  verified_at: string | null;
}

export interface Subscription {
  user_id: string;
  plan: Plan | null;
  cycle: Cycle | null;
  status: SubStatus | null;
  razorpay_subscription_id: string | null;
  current_period_end: string | null;
}

/** The minimal, non-sensitive entitlement view the server assembles for gating. */
export interface EntitlementContext {
  kycVerified: boolean;
  subscriptionActive: boolean;
  privileged: boolean;
  plan: Plan | null;
}
