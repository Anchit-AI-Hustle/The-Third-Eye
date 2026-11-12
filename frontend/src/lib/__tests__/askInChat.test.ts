import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => true) }));

import { askInChat, ASK_CHAT_ID } from "@/lib/askInChat";
import { sendPush } from "@/lib/push";

describe("askInChat", () => {
  it("appends the question in one database call and notifies", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await askInChat({ rpc } as never, "u@x.com", "Which hotel should I book?");
    expect(rpc).toHaveBeenCalledWith("append_conversation_message", expect.objectContaining({
      p_user: "u@x.com", p_id: ASK_CHAT_ID,
      p_message: expect.objectContaining({ role: "assistant", content: "Which hotel should I book?" }),
      p_history: { role: "assistant", content: "Which hotel should I book?" },
    }));
    expect(sendPush).toHaveBeenCalledWith("u@x.com", "JARVIS needs you", "Which hotel should I book?", `/assistant?chat=${ASK_CHAT_ID}`);
  });
});
