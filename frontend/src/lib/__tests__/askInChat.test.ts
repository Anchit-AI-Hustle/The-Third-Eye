import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => true) }));

import { askInChat, ASK_CHAT_ID } from "@/lib/askInChat";
import { sendPush } from "@/lib/push";

function fakeDb(existing: Record<string, unknown> | null) {
  const upserts: Record<string, unknown>[] = [];
  const chain = {
    select: () => chain, eq: () => chain,
    maybeSingle: async () => ({ data: existing }),
    upsert: async (row: Record<string, unknown>) => { upserts.push(row); return { error: null }; },
  };
  return { db: { from: () => chain } as never, upserts };
}

describe("askInChat", () => {
  it("adds the question as an assistant message to the running chat and notifies", async () => {
    const { db, upserts } = fakeDb({ messages: [{ id: "a", role: "assistant", content: "earlier" }], history: [] });
    await askInChat(db, "u@x.com", "Which hotel should I book?");
    expect(upserts[0].id).toBe(ASK_CHAT_ID);
    const messages = upserts[0].messages as { role: string; content: string }[];
    expect(messages.map((m) => m.content)).toEqual(["earlier", "Which hotel should I book?"]);
    expect(messages[1].role).toBe("assistant");
    expect(sendPush).toHaveBeenCalledWith("u@x.com", "JARVIS needs you", "Which hotel should I book?", `/assistant?chat=${ASK_CHAT_ID}`);
  });
});
