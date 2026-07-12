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
    "/knowledge/:path*",
    "/finance/:path*",
  ],
};
