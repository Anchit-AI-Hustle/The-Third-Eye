import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { localDay } from "@/lib/localDay";
import { parseLlmJson } from "@/lib/llmJson";

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
  let timezone: string | undefined;
  try {
    const body = await req.json();
    text = String(body?.text ?? "").slice(0, 500);
    timezone = typeof body?.timezone === "string" ? body.timezone : undefined;
  } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!text.trim()) return Response.json({ error: "Empty" }, { status: 400 });

  const today = localDay(new Date(), timezone);

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
    const parsed = parseLlmJson(out.text).value as { amount?: unknown; category?: string; note?: unknown; spent_on?: string };
    const amount = Number(parsed.amount) || 0;
    const category = CATEGORIES.includes(parsed.category ?? "") ? parsed.category : "Other";
    const spent_on = /^\d{4}-\d{2}-\d{2}$/.test(parsed.spent_on ?? "") ? parsed.spent_on : today;
    return Response.json({ amount, category, note: String(parsed.note ?? "").slice(0, 200), spent_on });
  } catch {
    return Response.json(fallbackParse(text, today));
  }
}

const KEYWORDS: [string, RegExp][] = [
  ["Groceries", /grocer|vegetable|fruit|milk|bigbasket|blinkit|zepto|instamart|supermarket/i],
  ["Food", /food|lunch|dinner|breakfast|coffee|chai|tea|snack|restaurant|zomato|swiggy|pizza|cafe/i],
  ["Transport", /uber|ola|rapido|cab|taxi|auto|metro|bus|fuel|petrol|diesel|parking|toll/i],
  ["Bills", /bill|rent|electric|water|gas|internet|wifi|broadband|recharge|emi|insurance/i],
  ["Health", /doctor|medicine|pharmacy|hospital|clinic|gym|lab test/i],
  ["Entertainment", /movie|netflix|spotify|concert|game|show|prime/i],
  ["Travel", /flight|hotel|train|trip|airbnb|booking/i],
  ["Shopping", /amazon|flipkart|myntra|clothes|shoes|shopping|gift/i],
];

// No AI answered: the amount is the number next to a currency marker, else the
// largest one ("2 coffees for 450" is 450, not 2); "yesterday" is honoured and
// the category comes from the words.
function fallbackParse(text: string, today: string) {
  const nums = [...text.matchAll(/(?:(₹|rs\.?|inr)\s*)?(\d[\d,]*(?:\.\d+)?)/gi)]
    .map((m) => ({ marked: !!m[1], raw: m[0], value: Number(m[2].replace(/,/g, "")) }));
  const pick = nums.find((n) => n.marked) ?? nums.reduce<(typeof nums)[number] | undefined>((a, n) => (!a || n.value > a.value ? n : a), undefined);
  const day = new Date(`${today}T12:00:00Z`);
  if (/\byesterday\b/i.test(text)) day.setUTCDate(day.getUTCDate() - 1);
  const category = KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "Other";
  const note = text.replace(pick?.raw ?? "", "").replace(/[₹$]|\brs\.?|\binr\b|\byesterday\b|\btoday\b/gi, "").replace(/\s+/g, " ").trim();
  return { amount: pick?.value ?? 0, category, note: note.slice(0, 200), spent_on: day.toISOString().slice(0, 10) };
}
