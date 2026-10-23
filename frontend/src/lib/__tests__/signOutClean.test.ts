import { beforeEach, describe, expect, it } from "vitest";
import { clearSensitiveLocalData } from "@/lib/signOutClean";

beforeEach(() => localStorage.clear());

describe("signing out on a shared browser", () => {
  it("removes every personal cache, and keeps device settings", () => {
    for (const k of ["jarvis_contacts_v1:me@x.com", "te_vault:dev_1:generations:list", "te_lifelog_v1_2026-10-17", "te_lifelog_index_v1", "te_music_tracks_v1", "book-studio:abc", "te_active_mode", "te_device_id_v1"]) localStorage.setItem(k, "x");
    clearSensitiveLocalData();
    const left = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort();
    expect(left).toEqual(["te_active_mode", "te_device_id_v1"]);
  });
});
