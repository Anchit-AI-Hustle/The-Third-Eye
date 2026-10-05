// The session cookie name has to be the same in the Auth route (which sets it)
// and in middleware (which reads it). NextAuth picks "__Secure-" from
// NEXTAUTH_URL on one side and from VERCEL on the other. When those disagree,
// a successful Google return is treated as signed-out and the dashboard sends
// the browser back to /auth/signin.

export function authUsesSecureCookies(): boolean {
  const url = process.env.NEXTAUTH_URL;
  if (url) return url.startsWith("https://");
  return process.env.VERCEL === "1";
}

export function sessionCookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}next-auth.session-token`;
}
