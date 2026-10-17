import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const syncDeviceContacts = vi.fn(async () => ({ count: 2, supported: true }));
const upload = vi.fn(async (f: File[]) => f);
const dataSave = vi.fn(async () => "saved");
vi.mock("@/hooks/useLocalContacts", () => ({ useLocalContacts: () => ({ syncDeviceContacts }) }));
vi.mock("@/hooks/useLocalKnowledge", () => ({ useLocalKnowledge: () => ({ upload }) }));
vi.mock("@/lib/dataClient", () => ({ dataSave: (...a: unknown[]) => dataSave(...(a as [])) }));

import { NativeAutoSync } from "@/components/layout/NativeAutoSync";

afterEach(() => { delete (window as { Capacitor?: unknown }).Capacitor; localStorage.clear(); vi.clearAllMocks(); });

describe("the iPhone app syncs on its own when opened", () => {
  it("pulls contacts, new photos and the chosen folder without any picker", async () => {
    const DeviceSync = {
      photoAccess: async () => ({ status: "full" }),
      listPhotos: vi.fn(async ({ before }: { before?: string }) => ({ photos: before ? [] : [{ id: "p1", takenAt: "2026-10-01T00:00:00.000Z", width: 1, height: 1, favorite: false, thumb: "x" }] })),
      chooseFolder: vi.fn(),
      folderStatus: async () => ({ name: "iCloud Drive" }),
      listFolderFiles: async () => ({ files: [{ path: "plan.md", size: 4, modified: "2026-10-01T00:00:00.000Z" }] }),
      readFolderFile: async () => ({ data: btoa("plan") }),
    };
    (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true, Plugins: { DeviceSync } };

    render(<NativeAutoSync />);

    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(syncDeviceContacts).toHaveBeenCalled();
    expect(dataSave).toHaveBeenCalledWith("device_photos", [expect.objectContaining({ id: "p1", taken_at: "2026-10-01T00:00:00.000Z" })]);
    expect((upload.mock.calls[0][0] as File[])[0].name).toBe("plan.md");
    expect(DeviceSync.chooseFolder).not.toHaveBeenCalled();
  });

  it("does nothing in a browser", async () => {
    render(<NativeAutoSync />);
    await new Promise((r) => setTimeout(r, 20));
    expect(syncDeviceContacts).not.toHaveBeenCalled();
    expect(dataSave).not.toHaveBeenCalled();
  });
});
