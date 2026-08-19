// web/lib/database.types.ts
// Minimal Database typing so the Supabase client accepts our inserts/updates instead of
// inferring `never`. This is a permissive placeholder — in Phase 2 replace it with the file
// generated from the live schema:  `supabase gen types typescript --linked > lib/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type LooseTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type Tables =
  | "profiles"
  | "kyc_verifications"
  | "subscriptions"
  | "channels"
  | "content_pillars"
  | "content_plan"
  | "scheduled_posts"
  | "deals"
  | "consents"
  | "audit_log"
  | "organizations"
  | "memberships"
  | "org_invites";

export interface Database {
  public: {
    Tables: Record<Tables, LooseTable>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
