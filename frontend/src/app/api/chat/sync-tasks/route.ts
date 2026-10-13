import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncChatTasks } from "@/lib/chatTasks";

export const runtime = "nodejs";
export const maxDuration = 60;

const COOLDOWN_MS = 20_000;
const lastRun = new Map<string, number>();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { chatId?: unknown } | null;
  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  if (!chatId) return Response.json({ error: "chatId required" }, { status: 400 });

  const key = `${email}:${chatId}`;
  const now = Date.now();
  if (now - (lastRun.get(key) ?? 0) < COOLDOWN_MS) return Response.json({ skipped: "cooldown" });
  if (lastRun.size > 1000) for (const [k, t] of lastRun) if (now - t >= COOLDOWN_MS) lastRun.delete(k);
  lastRun.set(key, now);

  return Response.json(await syncChatTasks(email, chatId));
}
