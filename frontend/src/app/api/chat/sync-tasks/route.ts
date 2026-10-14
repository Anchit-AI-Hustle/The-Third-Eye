import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncChatTasks } from "@/lib/chatTasks";

export const runtime = "nodejs";
export const maxDuration = 60;

// One sync per chat at a time on this instance; a request that arrives
// mid-sync runs after it, so the turn that triggered it is still read.
const running = new Map<string, Promise<unknown>>();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { chatId?: unknown } | null;
  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  if (!chatId) return Response.json({ error: "chatId required" }, { status: 400 });

  const key = `${email}:${chatId}`;
  const run = (running.get(key) ?? Promise.resolve()).catch(() => {}).then(() => syncChatTasks(email, chatId));
  running.set(key, run);
  try {
    return Response.json(await run);
  } finally {
    if (running.get(key) === run) running.delete(key);
  }
}
