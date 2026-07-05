import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTier } from "@/lib/usage";
import { limitsFor } from "@/lib/entitlements";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;
  const tier = await getTier(email);
  return new Response(
    JSON.stringify({ tier, limits: limitsFor(tier), authenticated: !!email }),
    { headers: { "Content-Type": "application/json" } },
  );
}
