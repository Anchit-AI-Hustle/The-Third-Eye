import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveAuthSecret } from "@/lib/authSecret";

// Kolab Studio (/kolab/studio/*) runs its OWN Supabase Auth session (a separate Supabase
// project from the app's own — see frontend/src/lib/kolab-studio/env.ts) on top of this app's
// NextAuth gate. Its httpOnly session cookies need refreshing on every request the same way
// Kolab's own middleware.ts did standalone, or a stale access token would silently fail
// server-side reads/writes instead of refreshing. Skips cleanly (no-op) if the Kolab Supabase
// project isn't configured yet, so the rest of the app is never affected by this being unset.
async function refreshKolabStudioSession(req: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next();
  const url = process.env.NEXT_PUBLIC_KOLAB_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_KOLAB_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(toSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          for (const { name, value } of toSet) req.cookies.set(name, value);
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });
    await supabase.auth.getUser();
  } catch {
    // Never let a Kolab Studio session hiccup break the rest of the request.
  }
  return response;
}

export default withAuth(
  async function middleware(req) {
    if (req.nextUrl.pathname.startsWith("/kolab/studio")) {
      return refreshKolabStudioSession(req);
    }
    return NextResponse.next();
  },
  {
    secret: resolveAuthSecret(),
    pages: { signIn: "/auth/signin" },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/apps/:path*",
    "/tasks/:path*",
    "/job-agent/:path*",
    "/kolab/:path*",
    "/plans/:path*",
    "/generations/:path*",
    "/agents/:path*",
    "/assistant/:path*",
    "/capture/:path*",
    "/activity/:path*",
    "/knowledge/:path*",
    "/finance/:path*",
    "/notes/:path*",
    "/goals/:path*",
    "/tools/:path*",
    "/capabilities/:path*",
    "/audit/:path*",
  ],
};
