import { describe, it, expect } from "vitest";
import {
  discoverConversations,
  includedConversations,
  listConversations,
  setIncluded,
} from "@/lib/conversationSources";
import { CONNECTORS, availableConnectors, unavailableConnectors, byId } from "@/lib/connectors";
import type { Sb } from "@/lib/cron";

// A stand-in for the two Supabase call chains this module uses. Records what was
// sent so we can assert on the query shape — specifically that discovery uses
// insert-if-absent rather than a true upsert, which is what stops a poll from
// resetting the user's selection.
function fakeSb(rows: Record<string, unknown>[] = []) {
  const calls: { op: string; payload?: unknown; opts?: unknown; filters: [string, unknown][] }[] = [];

  function chain(op: string, payload?: unknown, opts?: unknown) {
    const call = { op, payload, opts, filters: [] as [string, unknown][] };
    calls.push(call);
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        call.filters.push([k, v]);
        return api;
      },
      in: (k: string, v: unknown) => {
        call.filters.push([k, v]);
        return api;
      },
      order: () => api,
      then: (res: (v: { data: unknown; error: null }) => unknown) => res({ data: rows, error: null }),
    };
    return api;
  }

  const sb = {
    from: () => ({
      upsert: (payload: unknown, opts: unknown) => chain("upsert", payload, opts),
      update: (payload: unknown) => chain("update", payload),
      select: () => chain("select"),
    }),
  };
  return { sb: sb as unknown as Sb, calls };
}

describe("conversationSources — opt-in gating", () => {
  it("discovery inserts-if-absent so a re-poll cannot reset a selection", async () => {
    const { sb, calls } = fakeSb([{ conversation_id: "spaces/A" }]);
    const res = await discoverConversations(sb, "a@b.com", "google-chat", [
      { conversationId: "spaces/A", label: "Team", link: "https://x", isGroup: true },
    ]);

    expect(res.discovered).toBe(1);
    const up = calls.find((c) => c.op === "upsert");
    expect(up).toBeTruthy();
    // The guarantee: DO NOTHING on conflict, never an overwrite of `included`.
    expect((up!.opts as { ignoreDuplicates?: boolean }).ignoreDuplicates).toBe(true);
    // And it never sends `included`, so the column keeps its FALSE default.
    expect(Object.keys((up!.payload as Record<string, unknown>[])[0])).not.toContain("included");
  });

  it("discovery is a no-op when the provider returns nothing", async () => {
    const { sb, calls } = fakeSb();
    expect(await discoverConversations(sb, "a@b.com", "google-chat", [])).toEqual({ discovered: 0 });
    expect(calls).toHaveLength(0);
  });

  it("ingest sees nothing until a conversation is opted in", async () => {
    const { sb, calls } = fakeSb([]);
    expect(await includedConversations(sb, "a@b.com", "google-chat")).toEqual([]);
    // Scoped to this user + connector, and filtered to included = true.
    expect(calls[0].filters).toEqual([
      ["user_id", "a@b.com"],
      ["connector", "google-chat"],
      ["included", true],
    ]);
  });

  it("returns label and link for opted-in conversations so tasks can name their chat", async () => {
    const { sb } = fakeSb([{ conversation_id: "spaces/A", label: "Team", link: "https://x" }]);
    expect(await includedConversations(sb, "a@b.com", "google-chat")).toEqual([
      { conversationId: "spaces/A", label: "Team", link: "https://x" },
    ]);
  });

  it("the picker list reports each row's opt-in state", async () => {
    const { sb } = fakeSb([
      { conversation_id: "spaces/A", label: "Team", link: null, is_group: true, included: true },
      { conversation_id: "spaces/B", label: null, link: null, is_group: null, included: null },
    ]);
    expect(await listConversations(sb, "a@b.com", "google-chat")).toEqual([
      { conversationId: "spaces/A", label: "Team", link: null, isGroup: true, included: true },
      { conversationId: "spaces/B", label: null, link: null, isGroup: false, included: false },
    ]);
  });

  it("setIncluded scopes the write to the caller's own rows", async () => {
    const { sb, calls } = fakeSb([{ conversation_id: "spaces/A" }]);
    expect(await setIncluded(sb, "a@b.com", "google-chat", ["spaces/A"], true)).toEqual({ updated: 1 });
    const upd = calls.find((c) => c.op === "update")!;
    expect((upd.payload as { included: boolean }).included).toBe(true);
    expect(upd.filters).toEqual([
      ["user_id", "a@b.com"],
      ["connector", "google-chat"],
      ["conversation_id", ["spaces/A"]],
    ]);
  });

  it("setIncluded ignores an empty id list rather than updating every row", async () => {
    const { sb, calls } = fakeSb();
    expect(await setIncluded(sb, "a@b.com", "google-chat", [], true)).toEqual({ updated: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("connectors registry", () => {
  it("has unique ids", () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only google-chat is live, and it is group-capable", () => {
    const live = CONNECTORS.filter((c) => c.live);
    expect(live.map((c) => c.id)).toEqual(["google-chat"]);
    expect(live[0].groups).toBe(true);
  });

  it("unreachable connectors explain why and are never offered", () => {
    for (const c of unavailableConnectors()) {
      expect(c.reach).toBe("none");
      expect(c.blocked).toBeTruthy();
      expect(c.live).toBe(false);
      expect(c.api).toBeNull();
    }
    expect(availableConnectors().every((c) => c.reach !== "none")).toBe(true);
  });

  it("every reachable connector names the API it reads through", () => {
    for (const c of availableConnectors()) {
      // An import-based source has no API by definition; everything else must cite one.
      if (c.reach === "import") expect(c.api).toBeNull();
      else expect(c.api).toBeTruthy();
      expect(c.blocked).toBeUndefined();
    }
  });

  it("byId resolves known ids and rejects unknown ones", () => {
    expect(byId("google-chat")?.label).toBe("Google Chat");
    // The API route relies on this to reject arbitrary connector strings.
    expect(byId("not-a-connector" as never)).toBeUndefined();
  });
});
