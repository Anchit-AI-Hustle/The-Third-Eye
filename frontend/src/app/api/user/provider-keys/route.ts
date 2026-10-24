import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteOwnKey, HF_OAUTH, loadOwnKeys, ollamaUrlProblem, OWN_KEY_PROVIDERS, saveOwnKey, type OwnKeyProvider } from "@/lib/providerKeys";

export const runtime = "nodejs";

const isProvider = (p: unknown): p is OwnKeyProvider => OWN_KEY_PROVIDERS.includes(p as OwnKeyProvider);

async function userEmail() {
  return (await getServerSession(authOptions))?.user?.email ?? null;
}

// Keys never leave the server: the list carries only the last four characters
// (or the Ollama host) so the user can tell which key is saved.
export async function GET() {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const own = await loadOwnKeys(email);
  const keys = OWN_KEY_PROVIDERS.filter((p) => own[p]).map((p) => ({ provider: p, hint: p === "ollama" ? new URL(own[p]!).host : `…${own[p]!.slice(-4)}` }));
  return Response.json({ keys }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { provider, value } = (await req.json().catch(() => ({}))) as { provider?: unknown; value?: unknown };
  const v = typeof value === "string" ? value.trim() : "";
  if (!isProvider(provider)) return Response.json({ error: "Unknown provider" }, { status: 400 });
  if (!v || v.length > 500) return Response.json({ error: "Paste the key (or URL) first." }, { status: 400 });
  const problem = provider === "ollama" ? ollamaUrlProblem(v) : null;
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (!(await saveOwnKey(email, provider, v))) {
    return Response.json({ error: "Keys can't be stored on this deployment yet (it needs TOKEN_ENCRYPTION_KEY and the database)." }, { status: 503 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const provider = new URL(req.url).searchParams.get("provider");
  if (!isProvider(provider)) return Response.json({ error: "Unknown provider" }, { status: 400 });
  await deleteOwnKey(email, provider);
  if (provider === "huggingface") await deleteOwnKey(email, HF_OAUTH);
  return Response.json({ ok: true });
}
