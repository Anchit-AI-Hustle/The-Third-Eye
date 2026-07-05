// Gemini text-embedding-004 (768-dim). Server-only. Returns null when the key
// is missing so Cortex degrades to the app's keyword fallbacks.
const MODEL = "text-embedding-004";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

export function cortexEnabled(): boolean {
  return !!apiKey();
}

export async function embed(text: string): Promise<number[] | null> {
  const key = apiKey();
  if (!key || !text.trim()) return null;
  try {
    const res = await fetch(`${BASE}/models/${MODEL}:embedContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: `models/${MODEL}`, content: { parts: [{ text: text.slice(0, 8000) }] } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding?.values ?? null;
  } catch {
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  // Gemini has a batch endpoint, but sequential keeps it simple and rate-safe
  // for the modest chunk counts of a personal knowledge base.
  const out: (number[] | null)[] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}
