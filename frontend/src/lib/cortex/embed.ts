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

// One request per 100 texts (Gemini's batch limit) instead of one per text,
// so a large import or document embeds in seconds.
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const key = apiKey();
  if (!key) return texts.map(() => null);
  const out: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const part = texts.slice(i, i + 100);
    try {
      const res = await fetch(`${BASE}/models/${MODEL}:batchEmbedContents?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: part.map((t) => ({ model: `models/${MODEL}`, content: { parts: [{ text: t.slice(0, 8000) }] } })) }),
      });
      const data = res.ok ? await res.json() : null;
      const values: (number[] | undefined)[] = (data?.embeddings ?? []).map((e: { values?: number[] }) => e.values);
      out.push(...part.map((_, j) => values[j] ?? null));
    } catch {
      out.push(...part.map(() => null));
    }
  }
  return out;
}
