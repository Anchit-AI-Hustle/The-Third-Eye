import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";

export const runtime = "nodejs";
export const maxDuration = 30;

// Next.js route files may only export route handlers/config, so keep this local.
const CATEGORIES = [
  "Food", "Groceries", "Transport", "Shopping", "Bills",
  "Health", "Entertainment", "Travel", "Other",
];

// Turns free text ("250 coffee", "spent 1200 on groceries yesterday") into a
// structured expense. LLM-first (via the quota-cascading client), with a
// regex fallback so a logged expense never silently fails when providers are
// unavailable.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let text = "";
  try { text = String((await req.json())?.text ?? "").slice(0, 500); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!text.trim()) return Response.json({ error: "Empty" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  try {
    const out = await llmCascade({
      jsonMode: true,
      system:
        `You extract a single expense from a short note. Today is ${today}.\n` +
        `Return ONLY JSON: {"amount": number, "category": string, "note": string, "spent_on": "YYYY-MM-DD"}.\n` +
        `- amount: the numeric amount spent (no currency symbol). If none, 0.\n` +
        `- category: EXACTLY one of ${CATEGORIES.join(", ")}. Pick the closest.\n` +
        `- note: a short description (what it was for), may be empty.\n` +
        `- spent_on: resolve relative dates ("today", "yesterday") against today; default to today.`,
      messages: [{ role: "user", content: text }],
    });
    const parsed = JSON.parse(out.text);
    const amount = Number(parsed.amount) || 0;
    const category = CATEGORIES.includes(parsed.category) ? parsed.category : "Other";
    const spent_on = /^\d{4}-\d{2}-\d{2}$/.test(parsed.spent_on) ? parsed.spent_on : today;
    return Response.json({ amount, category, note: String(parsed.note ?? "").slice(0, 200), spent_on });
  } catch {
    // Fallback: pull the first number out; leave the rest as the note.
    const m = text.match(/(\d+(?:\.\d+)?)/);
    const amount = m ? Number(m[1]) : 0;
    const note = text.replace(m?.[0] ?? "", "").replace(/[₹$]/g, "").trim();
    return Response.json({ amount, category: "Other", note: note.slice(0, 200), spent_on: today });
  }
}
