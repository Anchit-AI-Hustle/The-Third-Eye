import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/authRedirect";
import { SignInClient } from "./SignInClient";

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string; error?: string };
}) {
  const callbackUrl = safeCallbackPath(searchParams?.callbackUrl);
  // An error means the last attempt already came back here. Sending a stale
  // session straight to the dashboard is what made this page reload forever.
  if (!searchParams?.error) {
    const session = await getServerSession(authOptions);
    if (session?.user) redirect(callbackUrl);
  }
  return <SignInClient callbackUrl={callbackUrl} initialError={searchParams?.error ?? null} />;
}
