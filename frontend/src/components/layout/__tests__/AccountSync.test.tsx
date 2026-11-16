import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

let email = "a@x.com";
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email } }, status: "authenticated" }) }));

import { AccountSync } from "@/components/layout/AccountSync";

let cloud: { key: string; value: string | null; updatedAt: number }[] = [];
const puts: { key: string; value: string | null }[][] = [];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  sessionStorage.setItem("te_account_synced", "1");
  cloud = [];
  puts.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { puts.push(JSON.parse(init.body as string).items); return new Response("{}"); }
    return new Response(JSON.stringify({ items: cloud }));
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); email = "a@x.com"; });

const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(2_000); }); };

describe("AccountSync", () => {
  it("applies the account's newer values on this device", async () => {
    cloud = [{ key: "jarvis_active_agent", value: "coach", updatedAt: Date.now() }];
    render(<AccountSync />);
    await flush();
    expect(localStorage.getItem("jarvis_active_agent")).toBe("coach");
  });

  it("sends account-level writes, but not device-level ones", async () => {
    render(<AccountSync />);
    await flush();
    localStorage.setItem("te_active_mode", "work");
    localStorage.setItem("te_device_id_v1", "dev_1");
    await flush();
    const sent = puts.flat();
    expect(sent).toContainEqual(expect.objectContaining({ key: "te_active_mode", value: "work" }));
    expect(sent.some((i) => i.key === "te_device_id_v1")).toBe(false);
  });

  it("never sends another account's leftovers to the one signing in", async () => {
    localStorage.setItem("te_sync_owner_v1", "previous@x.com");
    localStorage.setItem("jarvis_agent_profiles", "[\"theirs\"]");
    email = "b@x.com";
    render(<AccountSync />);
    await flush();
    expect(puts.flat().some((i) => i.key === "jarvis_agent_profiles")).toBe(false);
  });
});
