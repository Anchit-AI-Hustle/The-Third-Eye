import { describe, expect, it, vi } from "vitest";
import { searchPhotos } from "@/lib/photoSearch";

function fakeDb(rows: Record<string, unknown>[]) {
  const calls: unknown[][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q; };
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
  return { db: { from: (t: string) => { calls.push(["from", t]); return q; } } as never, calls };
}

const at = (id: string, taken_at: string, lat: number | null = null, lon: number | null = null) => ({ id, taken_at, width: 1, height: 1, lat, lon, favorite: false });

describe("finding the person's synced photos", () => {
  it("filters by date and returns thumbnails the chat can show", async () => {
    const { db, calls } = fakeDb([at("a", "2026-09-12T10:00:00Z"), at("b", "2026-09-10T10:00:00Z")]);
    const r = await searchPhotos(db, "me@x.com", { from: "2026-09-10", to: "2026-09-12" });
    expect(calls).toContainEqual(["eq", "user_id", "me@x.com"]);
    expect(calls).toContainEqual(["gte", "taken_at", "2026-09-10T00:00:00.000Z"]);
    expect(calls).toContainEqual(["lte", "taken_at", "2026-09-12T23:59:59.999Z"]);
    expect(r.photos.map((p) => p.url)).toEqual(["/api/photos/thumb?id=a", "/api/photos/thumb?id=b"]);
    expect(r.result).toMatch(/2 photos/);
  });

  it("keeps only photos taken near a named place", async () => {
    const { db } = fakeDb([at("goa", "2026-09-12T10:00:00Z", 15.5, 73.8), at("delhi", "2026-09-11T10:00:00Z", 28.6, 77.2), at("none", "2026-09-10T10:00:00Z")]);
    const geocode = vi.fn(async () => ({ name: "Goa", lat: 15.4, lon: 74.0 }));
    const r = await searchPhotos(db, "me@x.com", { place: "Goa" }, geocode);
    expect(geocode).toHaveBeenCalledWith("Goa");
    expect(r.photos.map((p) => p.id)).toEqual(["goa"]);
  });

  it("says plainly when nothing has synced yet", async () => {
    const { db } = fakeDb([]);
    const r = await searchPhotos(db, "me@x.com", {});
    expect(r.photos).toEqual([]);
    expect(r.result).toMatch(/No synced photos match/);
  });
});
