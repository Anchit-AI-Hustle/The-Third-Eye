// web/lib/supabaseServer.ts
// SERVER-ONLY Supabase clients for Kolab's OWN Supabase project. Two flavours:
//   • supabaseServer()  — request-scoped, reads the user's session from httpOnly cookies and
//                         runs queries AS THAT USER, so Row-Level Security applies. Use this for
//                         reads/writes on behalf of the signed-in user.
//   • supabaseAdmin()   — service-role client that BYPASSES RLS. Use ONLY for trusted server
//                         operations that need it (webhooks, audit writes, privileged provisioning).
//                         Never expose its key or return its client to the browser.
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "./database.types";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `set` throws in a Server Component render; the middleware refreshes the session there.
        }
      },
    },
  });
}

let admin: ReturnType<typeof createClient<Database>> | null = null;
export function supabaseAdmin() {
  if (!admin) {
    admin = createClient<Database>(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
