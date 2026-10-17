import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { matchesTestCode } from "@/lib/testUnlock";
import { rateLimit } from "@/lib/kolab-studio/rateLimit";

export const runtime = "nodejs";

// Checks the test unlock code on the server, so the code never reaches the browser.
export async function POST(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!rateLimit(`unlock:${email}`, 5, 15 * 60_000).allowed) {
    return Response.json({ ok: false, error: "Too many tries. Wait 15 minutes." }, { status: 429 });
  }
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  return Response.json({ ok: matchesTestCode(String(code ?? "")) });
}
