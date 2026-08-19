// web/lib/supabaseClient.ts
// Only the PUBLIC anon key is used in the browser. Never import the service-role key here.
//
// Uses @supabase/ssr's browser client so the session is persisted in COOKIES (not just
// localStorage). This is required: the server (Server Components + middleware) reads auth from
// cookies via createServerClient, so a localStorage-only session would leave the server unaware
// of a signed-in user and bounce them back to /kolab/studio/auth after login.
//
// This is Kolab's OWN Supabase project (KOLAB_-prefixed env vars) — deliberately separate from
// the app's own Supabase client in `@/lib/supabase`.
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_KOLAB_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_KOLAB_SUPABASE_ANON_KEY!
);
