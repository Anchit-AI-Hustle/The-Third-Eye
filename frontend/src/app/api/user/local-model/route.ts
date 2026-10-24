import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteOwnKey, isModelName, loadOwnKeys, localFirst, saveOwnKey, tunnelAuth } from "@/lib/providerKeys";

export const runtime = "nodejs";

async function userEmail() {
  return (await getServerSession(authOptions))?.user?.email ?? null;
}

function assistantModels(raw?: string): Record<string, string> {
  try { return raw ? (JSON.parse(raw) as Record<string, string>) : {}; } catch { return {}; }
}

// How the user's own computer (Ollama, or any OpenAI-compatible local server)
// is used. The URL itself is saved through /api/user/provider-keys; the tunnel
// password is write-only, reported back only as set or not.
export async function GET() {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const own = await loadOwnKeys(email);
  return Response.json({
    connected: !!own.ollama,
    host: own.ollama ? new URL(own.ollama).host : null,
    localFirst: localFirst(own),
    model: own.ollama_model ?? null,
    assistantModels: assistantModels(own.ollama_models),
    hasToken: !!own.ollama_token,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { localFirst?: unknown; model?: unknown; assistantModels?: unknown; token?: unknown };
  const writes: [Parameters<typeof saveOwnKey>[1], string | null][] = [];

  if (body.localFirst !== undefined) {
    if (typeof body.localFirst !== "boolean") return Response.json({ error: "localFirst must be true or false" }, { status: 400 });
    writes.push(["local_first", body.localFirst ? null : "off"]);
  }
  if (body.model !== undefined) {
    const m = typeof body.model === "string" ? body.model.trim() : "";
    if (m && !isModelName(m)) return Response.json({ error: "That isn't a model name (for example llama3.1:8b)." }, { status: 400 });
    writes.push(["ollama_model", m || null]);
  }
  if (body.assistantModels !== undefined) {
    const map = body.assistantModels;
    if (!map || typeof map !== "object" || Array.isArray(map)) return Response.json({ error: "assistantModels must be an object" }, { status: 400 });
    const clean = Object.fromEntries(Object.entries(map as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, (v as string).trim()]));
    if (Object.keys(clean).length > 20 || Object.entries(clean).some(([k, v]) => !/^[\w-]{1,40}$/.test(k) || !isModelName(v))) {
      return Response.json({ error: "Each assistant needs a valid model name." }, { status: 400 });
    }
    writes.push(["ollama_models", Object.keys(clean).length ? JSON.stringify(clean) : null]);
  }
  if (body.token !== undefined) {
    const t = typeof body.token === "string" ? body.token.trim() : "";
    if (t.length > 300) return Response.json({ error: "That password is too long." }, { status: 400 });
    writes.push(["ollama_token", t || null]);
  }

  for (const [name, value] of writes) {
    if (value === null) await deleteOwnKey(email, name);
    else if (!(await saveOwnKey(email, name, value))) {
      return Response.json({ error: "Settings can't be stored on this deployment yet (it needs TOKEN_ENCRYPTION_KEY and the database)." }, { status: 503 });
    }
  }
  return Response.json({ ok: true });
}

// Checks the user's computer answers, through their tunnel, and lists the models it has.
export async function POST() {
  const email = await userEmail();
  if (!email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const own = await loadOwnKeys(email);
  if (!own.ollama) return Response.json({ error: "Add your computer's address first." }, { status: 400 });
  const started = Date.now();
  const r = await fetch(`${own.ollama.replace(/\/$/, "")}/v1/models`, {
    headers: own.ollama_token ? { Authorization: tunnelAuth(own.ollama_token) } : {},
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r) return Response.json({ ok: false, error: "No answer. Check that Ollama and the tunnel are running and the computer is awake." });
  if (r.status === 401 || r.status === 403) return Response.json({ ok: false, error: "The tunnel refused the password." });
  if (!r.ok) return Response.json({ ok: false, error: `The tunnel answered ${r.status}. Check that Ollama and the tunnel are running and the computer is awake.` });
  const data = (await r.json().catch(() => null)) as { data?: unknown } | null;
  if (!Array.isArray(data?.data)) return Response.json({ ok: false, error: "Something answered, but it isn't Ollama. Check the tunnel points at Ollama's port (11434)." });
  const models = (data.data as { id?: unknown }[]).map((m) => m?.id).filter((id): id is string => typeof id === "string");
  return Response.json({ ok: true, models, ms: Date.now() - started });
}
