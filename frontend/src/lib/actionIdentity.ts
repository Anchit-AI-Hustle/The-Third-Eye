import { createHash, createHmac, timingSafeEqual } from "node:crypto";
const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
export const actionHash = (tool: string, args: unknown) => createHash("sha256").update(JSON.stringify([tool, stable(args ?? {})])).digest("hex");
// The server signs the exact proposal that the card displays. A client id is not authorization.
export function actionProof(email: string, id: string, tool: string, args: unknown, expires = Date.now() + 24 * 60 * 60_000): string | null {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key) return null;
  const sig = createHmac("sha256", key).update(JSON.stringify([email, id, actionHash(tool, args), expires])).digest("hex");
  return `${expires}.${sig}`;
}
export function validActionProof(proof: unknown, email: string, id: string, tool: string, args: unknown): boolean {
  if (typeof proof !== "string") return false;
  const expires = Number(proof.split(".")[0]);
  if (!Number.isFinite(expires) || expires < Date.now() || expires > Date.now() + 24 * 60 * 60_000) return false;
  const expected = actionProof(email, id, tool, args, expires);
  return !!expected && expected.length === proof.length && timingSafeEqual(Buffer.from(expected), Buffer.from(proof));
}
