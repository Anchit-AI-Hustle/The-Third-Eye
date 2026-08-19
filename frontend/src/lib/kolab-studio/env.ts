// web/lib/env.ts
// Centralised, SERVER-ONLY environment access for the embedded Kolab Studio feature. Kolab
// uses its OWN dedicated Supabase project (separate schema/RLS from The Third Eye's own
// Supabase project), so every var is KOLAB_-prefixed to avoid colliding with the app's
// existing NEXT_PUBLIC_SUPABASE_* / SUPABASE_SERVICE_ROLE_KEY vars (frontend/src/lib/supabase.ts).
// Importing this from a Client Component would leak nothing (values are read lazily and the
// secret getters throw if bundled), but as a rule only import it in route handlers, server
// components, and lib/*Server code.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Public (safe in browser)
  appUrl: () => optional("NEXT_PUBLIC_KOLAB_APP_URL", "http://localhost:3000"),
  supabaseUrl: () => required("NEXT_PUBLIC_KOLAB_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_KOLAB_SUPABASE_ANON_KEY"),

  // Server-only secrets
  supabaseServiceRoleKey: () => required("KOLAB_SUPABASE_SERVICE_ROLE_KEY"),
  fieldEncryptionKey: () => optional("KOLAB_FIELD_ENCRYPTION_KEY"),

  // Feature flags
  devMode: () => optional("KOLAB_DEV_MODE", "false").toLowerCase() === "true",
  isProduction: () => process.env.NODE_ENV === "production",

  // Privileged accounts — server-side only (see lib/privileged.ts)
  privilegedNumbers: () => optional("KOLAB_PRIVILEGED_NUMBERS"),
};
