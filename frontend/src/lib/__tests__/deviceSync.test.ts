import { describe, expect, it, vi } from "vitest";
import { autoSyncDue, syncFolder, syncPhotos, type DevicePhoto, type DeviceSyncPlugin } from "@/lib/deviceSync";

const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
};
const photo = (id: string, takenAt: string): DevicePhoto => ({ id, takenAt, width: 4032, height: 3024, favorite: false, thumb: "AAAA" });

function plugin(over: Partial<DeviceSyncPlugin>): DeviceSyncPlugin {
  return {
    photoAccess: async () => ({ status: "full" }),
    listPhotos: async () => ({ photos: [] }),
    chooseFolder: async () => ({ name: "Docs" }),
    folderStatus: async () => ({ name: "Docs" }),
    listFolderFiles: async () => ({ files: [] }),
    readFolderFile: async () => ({ data: "" }),
    ...over,
  };
}

describe("photo sync from the iPhone library", () => {
  it("first run walks back from the newest photo, then later runs only fetch what is newer", async () => {
    const library = [photo("c", "2026-10-03T00:00:00.000Z"), photo("b", "2026-10-02T00:00:00.000Z"), photo("a", "2026-10-01T00:00:00.000Z")];
    const listPhotos = vi.fn(async ({ after, before, limit }: { after?: string; before?: string; limit: number }) => {
      if (after) return { photos: library.filter((p) => p.takenAt > after).reverse().slice(0, limit) };
      return { photos: library.filter((p) => !before || p.takenAt < before).slice(0, limit) };
    });
    const saved: unknown[][] = [];
    const store = memory();
    const p = plugin({ listPhotos });

    expect(await syncPhotos(p, async (rows) => { saved.push(rows); return true; }, store, { batch: 2 })).toBe(3);
    expect(saved.flat().map((r) => (r as { id: string }).id)).toEqual(["c", "b", "a"]);
    expect(saved[0][0]).toEqual({ id: "c", taken_at: "2026-10-03T00:00:00.000Z", width: 4032, height: 3024, lat: null, lon: null, favorite: false, thumb: "AAAA" });

    library.unshift(photo("d", "2026-10-04T00:00:00.000Z"));
    saved.length = 0;
    expect(await syncPhotos(p, async (rows) => { saved.push(rows); return true; }, store, { batch: 2 })).toBe(1);
    expect(saved.flat().map((r) => (r as { id: string }).id)).toEqual(["d"]);
  });

  it("does nothing when photo access is off", async () => {
    const listPhotos = vi.fn();
    expect(await syncPhotos(plugin({ photoAccess: async () => ({ status: "denied" }), listPhotos }), async () => true, memory())).toBe(0);
    expect(listPhotos).not.toHaveBeenCalled();
  });

  it("keeps its place when the server doesn't take a batch, so nothing is skipped next time", async () => {
    const store = memory();
    const p = plugin({ listPhotos: async () => ({ photos: [photo("a", "2026-10-01T00:00:00.000Z")] }) });
    expect(await syncPhotos(p, async () => false, store)).toBe(0);
    expect(store.get("te_photos_after")).toBeNull();
  });
});

describe("folder sync", () => {
  it("adds new and changed readable files once, without asking the person to pick them", async () => {
    let files = [
      { path: "notes/plan.md", size: 10, modified: "2026-10-01T00:00:00.000Z" },
      { path: "report.pdf", size: 20, modified: "2026-10-01T00:00:00.000Z" },
      { path: "movie.mov", size: 30, modified: "2026-10-01T00:00:00.000Z" },
      { path: "huge.pdf", size: 50 * 1024 * 1024, modified: "2026-10-01T00:00:00.000Z" },
    ];
    const readFolderFile = vi.fn(async () => ({ data: btoa("hello") }));
    const p = plugin({ listFolderFiles: async () => ({ files }), readFolderFile });
    const added: File[][] = [];
    const store = memory();
    const add = async (f: File[]) => { added.push(f); return f.length; };

    expect(await syncFolder(p, add, store)).toBe(2);
    expect(added[0].map((f) => f.name)).toEqual(["plan.md", "report.pdf"]);
    expect(await added[0][0].text()).toBe("hello");

    expect(await syncFolder(p, add, store)).toBe(0);

    files = [{ ...files[0], modified: "2026-10-05T00:00:00.000Z" }, ...files.slice(1)];
    expect(await syncFolder(p, add, store)).toBe(1);
    expect(readFolderFile).toHaveBeenLastCalledWith({ path: "notes/plan.md" });
  });

  it("skips a file the phone can't read and still adds the rest", async () => {
    const files = [
      { path: "a.md", size: 1, modified: "2026-10-01T00:00:00.000Z" },
      { path: "b.md", size: 1, modified: "2026-10-01T00:00:00.000Z" },
    ];
    const readFolderFile = vi.fn(async ({ path }: { path: string }) => {
      if (path === "a.md") throw new Error("Couldn't read a.md");
      return { data: btoa("ok") };
    });
    const added: string[] = [];
    expect(await syncFolder(plugin({ listFolderFiles: async () => ({ files }), readFolderFile }), async (f) => { added.push(...f.map((x) => x.name)); return f.length; }, memory())).toBe(1);
    expect(added).toEqual(["b.md"]);
  });

  it("skips quietly until a folder has been chosen", async () => {
    const listFolderFiles = vi.fn();
    expect(await syncFolder(plugin({ folderStatus: async () => ({}), listFolderFiles }), async () => 0, memory())).toBe(0);
    expect(listFolderFiles).not.toHaveBeenCalled();
  });
});

describe("automatic sync timing", () => {
  it("runs on open and again only after ten minutes", () => {
    const store = memory();
    expect(autoSyncDue(store, 1_000_000)).toBe(true);
    expect(autoSyncDue(store, 1_000_000 + 5 * 60_000)).toBe(false);
    expect(autoSyncDue(store, 1_000_000 + 11 * 60_000)).toBe(true);
  });
});
