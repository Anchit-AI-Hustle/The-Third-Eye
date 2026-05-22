import { withAuth } from "next-auth/middleware";

export default withAuth({
  secret: process.env.NEXTAUTH_SECRET ?? "set-NEXTAUTH_SECRET-env-var-in-vercel",
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
