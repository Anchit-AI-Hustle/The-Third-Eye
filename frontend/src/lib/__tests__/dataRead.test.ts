import { afterEach, describe, expect, it, vi } from "vitest";
import { dataRead } from "@/lib/dataClient";

afterEach(() => vi.unstubAllGlobals());

describe("dataRead", () => {
  it("returns the server's rows only when they were actually read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rows: [{ id: "a" }] })));
    expect(await dataRead("reminders")).toEqual([{ id: "a" }]);

    for (const res of [new Response(null, { status: 500 }), new Response(null, { status: 401 })]) {
      vi.stubGlobal("fetch", vi.fn(async () => res));
      expect(await dataRead("reminders")).toBeNull();
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await dataRead("reminders")).toBeNull();
  });
});
