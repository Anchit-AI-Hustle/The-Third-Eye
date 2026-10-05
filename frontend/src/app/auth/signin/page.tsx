import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { firstQueryValue, safeCallbackPath } from "@/lib/authRedirect";
import { SignInClient } from "./SignInClient";

// Next 16 hands searchParams over as a Promise. Reading it synchronously made
// `error` always undefined, so a failed Google return rendered a clean sign-in
// page and looked like a loop.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const error = firstQueryValue(params?.error) ?? null;
  const callbackUrl = safeCallbackPath(firstQueryValue(params?.callbackUrl));
  // An error means the last attempt already came back here. Sending a stale
  // session straight to the dashboard is what made this page reload forever.
  if (!error) {
    const session = await getServerSession(authOptions);
    if (session?.user) redirect(callbackUrl);
  }
  return <SignInClient callbackUrl={callbackUrl} initialError={error} />;
}
