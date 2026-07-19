import { withAuth } from "next-auth/middleware";
import { resolveAuthSecret } from "@/lib/authSecret";

export default withAuth({
  secret: resolveAuthSecret(),
  pages: { signIn: "/auth/signin" },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tasks/:path*",
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
