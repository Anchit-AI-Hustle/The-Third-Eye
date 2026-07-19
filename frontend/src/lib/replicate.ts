// Minimal Replicate REST client (no SDK dependency) for music generation.
// Mirrors the approach in the MusicGenAI repo: resolve a model's latest version,
// create a prediction, then poll it. Powered by REPLICATE_API_TOKEN.

const BASE = "https://api.replicate.com/v1";

function token(): string | null {
  return process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || null;
}

export function replicateConfigured(): boolean {
  return !!token();
}

async function rq(path: string, init?: RequestInit) {
  const t = token();
  if (!t) throw new Error("REPLICATE_API_TOKEN not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Replicate ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const versionCache: Record<string, { id: string; at: number }> = {};
const VERSION_TTL = 1000 * 60 * 60 * 12;

/** Resolve `owner/name` → latest version id (cached). */
export async function latestVersion(model: string): Promise<string> {
  const cached = versionCache[model];
  if (cached && Date.now() - cached.at < VERSION_TTL) return cached.id;
  const [owner, name] = model.split("/");
  const data = await rq(`/models/${owner}/${name}`);
  const id = data?.latest_version?.id;
  if (!id) throw new Error(`No version for model ${model}`);
  versionCache[model] = { id, at: Date.now() };
  return id;
}

export interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error: string | null;
}

/** Submit a prediction for a model (resolves the version automatically). */
export async function createPrediction(model: string, input: Record<string, unknown>): Promise<Prediction> {
  const version = await latestVersion(model);
  const p = await rq(`/predictions`, {
    method: "POST",
    body: JSON.stringify({ version, input }),
  });
  return { id: p.id, status: p.status, output: p.output ?? null, error: p.error ?? null };
}

export async function getPrediction(id: string): Promise<Prediction> {
  const p = await rq(`/predictions/${id}`);
  return { id: p.id, status: p.status, output: p.output ?? null, error: p.error ?? null };
}

/** Normalize the varied Replicate audio outputs (string | string[] | {audio}) to one URL. */
export function audioUrlFrom(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output.find((x) => typeof x === "string");
    return (first as string) ?? null;
  }
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const k of ["audio", "audio_out", "output", "url"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return null;
}
