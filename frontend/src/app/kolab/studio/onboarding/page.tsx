// web/app/onboarding/page.tsx — the "What are you here to do?" question (spec §2).
// Outside the (app) group so it's reachable before the user has any org. Requires auth.
// `?add=1` lets an existing user create ANOTHER workspace of any type (spec: "create more later").
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/kolab-studio/db";
import { getMyMemberships } from "@/lib/kolab-studio/org";
import { OnboardingClient } from "./OnboardingClient";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { add?: string };
}) {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/kolab/studio/auth");
  const memberships = await getMyMemberships();
  const addMode = searchParams?.add === "1";
  if (memberships.length > 0 && !addMode) redirect("/kolab/studio/home"); // already has an org
  return <OnboardingClient canGoBack={memberships.length > 0} />;
}
