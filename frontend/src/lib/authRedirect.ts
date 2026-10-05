// Where to send someone after Google returns. Never back to the sign-in page
// or the Auth API: those are the two URLs that were bouncing a finished
// sign-in straight into another one.

const BLOCKED = [/^\/auth(?:\/|$)/, /^\/api\/auth(?:\/|$)/];

export function safeCallbackPath(raw: string | null | undefined, baseOrigin?: string): string {
  if (!raw) return "/dashboard";
  let path = raw.trim();
  if (/^https?:\/\//i.test(path)) {
    if (!baseOrigin) return "/dashboard";
    try {
      const u = new URL(path);
      if (u.origin !== new URL(baseOrigin).origin) return "/dashboard";
      path = `${u.pathname}${u.search}`;
    } catch {
      return "/dashboard";
    }
  }
  if (!path.startsWith("/") || path.startsWith("//")) return "/dashboard";
  const pathname = path.split("?")[0] || "/";
  if (pathname === "/" || BLOCKED.some((re) => re.test(pathname))) return "/dashboard";
  return path;
}

export function safeRedirectUrl(url: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${safeCallbackPath(url, base)}`;
}
