// web/app/auth/page.tsx — sign-in. Server component reads the KOLAB_DEV_MODE flag (never trusts
// the client) and hides Test Sign-In in production; the interactive form is a Client Component.
import { redirect } from "next/navigation";
import { env } from "@/lib/kolab-studio/env";
import { getSessionUser } from "@/lib/kolab-studio/db";
import { AuthForm } from "./AuthForm";

export default async function AuthPage() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/kolab/studio/home");
  return <AuthForm devMode={env.devMode()} />;
}
