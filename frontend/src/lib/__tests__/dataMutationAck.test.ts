import { afterEach, describe, expect, it, vi } from "vitest";
import { dataInsert, dataUpdate, dataDelete } from "@/lib/dataClient";
afterEach(() => vi.restoreAllMocks());
describe("storage acknowledgments", () => {
  it("does not report HTTP errors or lost responses as saved", async () => {
    for (const status of [400, 401, 500, 501]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
      expect(await dataInsert("tasks", { title: "Synthetic" })).toBe(false);
      expect(await dataUpdate("tasks", "id", { title: "Synthetic" })).toBe(false);
      expect(await dataDelete("tasks", "id")).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("lost response"); }));
    expect(await dataInsert("tasks", {})).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // no hidden retry
  });
  it("requires an actual successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await dataInsert("tasks", {})).toBe(true);
  });
});
