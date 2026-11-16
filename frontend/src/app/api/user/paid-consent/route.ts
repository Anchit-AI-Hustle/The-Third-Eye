import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadOwnKeys, saveOwnKey } from "@/lib/providerKeys";
import { paidConsented } from "@/lib/freeOnly";

export const runtime = "nodejs";

// Paid providers a user can bring their own key for. Consent is a separate, explicit
// setting: saving a key does not turn it on, and it only ever applies to that user.
const CONSENTABLE = ["openai", "groq", "gemini", "mistral", "cerebras", "huggingface"] as const;
type P = (typeof CONSENTABLE)[number];

async function userEmail() {
  return (await getServerSession(authOptions))?.user?.email ?? null;
}

export async function GET() {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const own = await loadOwnKeys(email);
  return Response.json({ consent: CONSENTABLE.filter((p) => paidConsented(own, p)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { provider, consent } = (await req.json().catch(() => ({}))) as { provider?: unknown; consent?: unknown };
  if (!CONSENTABLE.includes(provider as P) || typeof consent !== "boolean") {
    return Response.json({ error: "Unknown provider" }, { status: 400 });
  }
  const own = await loadOwnKeys(email);
  if (consent && !own[provider as P]) return Response.json({ error: "Save your own key for this provider first." }, { status: 400 });
  const now = new Set(CONSENTABLE.filter((p) => paidConsented(own, p)));
  if (consent) now.add(provider as P); else now.delete(provider as P);
  if (!(await saveOwnKey(email, "paid_consent", JSON.stringify([...now])))) {
    return Response.json({ error: "Settings can't be stored on this deployment yet." }, { status: 503 });
  }
  return Response.json({ ok: true, consent: [...now] });
}
