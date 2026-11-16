import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PLATFORMS, PROVIDERS, listAccounts, providerConfig, removeAccount, type Platform } from "@/lib/social";

export const runtime = "nodejs";

// The person's social platforms: which can be connected here, and what is.
export async function GET() {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const accounts = await listAccounts(email);
  return Response.json({
    platforms: PLATFORMS.map((p) => ({
      id: p, name: PROVIDERS[p].name, available: Boolean(providerConfig(p)),
      accounts: accounts.filter((a) => a.platform === p).map((a) => ({ id: a.accountId, name: a.name })),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { platform?: string; account?: string } | null;
  if (!b?.platform || !PLATFORMS.includes(b.platform as Platform) || !b.account) return Response.json({ error: "platform and account required" }, { status: 400 });
  return Response.json({ ok: await removeAccount(email, b.platform as Platform, b.account) });
}
