import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// AES-256-GCM. Key derived from TOKEN_ENCRYPTION_KEY (with fallback to NEXTAUTH_SECRET).
// Format stored: base64(iv).base64(authTag).base64(ciphertext)
function candidateKeys(): Buffer[] {
  const raws = [
    process.env.TOKEN_ENCRYPTION_KEY,
    process.env.NEXTAUTH_SECRET,
    "jarvis-fallback-token-encryption-key-v1",
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  const seen = new Set<string>();
  const out: Buffer[] = [];
  for (const r of raws) {
    const trimmed = r.trim();
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(createHash("sha256").update(trimmed).digest());
  }
  return out;
}

export function encrypt(plain: string): string | null {
  const keys = candidateKeys();
  const k = keys[0];
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decrypt(payload: string): string | null {
  const keys = candidateKeys();
  if (!keys.length) return null;
  const [ivB64, tagB64, ctB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !ctB64) return null;
  for (const k of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
    } catch {
      // try next candidate key
    }
  }
  return null;
}
