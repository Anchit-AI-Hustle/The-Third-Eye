import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { authUsesSecureCookies, sessionCookieName } from "@/lib/authCookies";
import { resolveAuthSecret } from "@/lib/authSecret";

export async function middleware(req: NextRequest) {
  const secret = resolveAuthSecret();
  const secure = authUsesSecureCookies();
  // Read whichever name the Auth route actually set. Looking up only one of
  // them drops a valid session and the next page redirects back here.
  const names = [sessionCookieName(secure), sessionCookieName(!secure)];
  let token = null;
  for (const cookieName of names) {
    token = await getToken({
      req,
      secret,
      cookieName,
      secureCookie: cookieName.startsWith("__Secure-"),
    });
    if (token) break;
  }
  if (token) return NextResponse.next();

  const signIn = req.nextUrl.clone();
  signIn.pathname = "/auth/signin";
  signIn.search = "";
  signIn.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(signIn);
}

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
