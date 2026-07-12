import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

// Serves Kolab's privileged phone numbers + seed accounts from server env vars,
// so real personal numbers never live in the repo. Configure in Vercel:
//   KOLAB_PRIVILEGED = "9990001111,8880002222"   (comma-separated)
//   KOLAB_SEED       = '{"9990001111":{"name":"Full Name","handle":"@handle"}}'  (JSON)
export async function GET() {
  // Auth gate: these are real personal phone numbers — never expose them to
  // anonymous callers. Only signed-in users get the privileged config.
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ privileged: [], seed: {} }, { status: 401 });
  }

  const privileged = (process.env.KOLAB_PRIVILEGED || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let seed: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(process.env.KOLAB_SEED || "{}");
    if (parsed && typeof parsed === "object") seed = parsed as Record<string, unknown>;
  } catch {
    /* invalid JSON → no seeds */
  }

  return Response.json(
    { privileged, seed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
