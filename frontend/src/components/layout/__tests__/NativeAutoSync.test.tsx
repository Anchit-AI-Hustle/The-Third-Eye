import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const syncDeviceContacts = vi.fn(async () => ({ count: 2, supported: true }));
const upload = vi.fn(async (f: File[]) => f);
const dataSave = vi.fn(async () => "saved");
const dataRead = vi.fn(async (): Promise<unknown[] | null> => [{ id: "r1", title: "Call mom", body: null, fire_at: "2999-01-01T09:00:00.000Z", status: "pending", recurrence: null }]);
vi.mock("@/hooks/useLocalContacts", () => ({ useLocalContacts: () => ({ syncDeviceContacts }) }));
vi.mock("@/hooks/useLocalKnowledge", () => ({ useLocalKnowledge: () => ({ upload }) }));
vi.mock("@/lib/dataClient", () => ({ dataSave: (...a: unknown[]) => dataSave(...(a as [])), dataRead: (...a: unknown[]) => dataRead(...(a as [])) }));

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

  it("puts upcoming reminders and the morning briefing on the phone, and opens the app where a tapped one points", async () => {
    let tapped: ((a: { notification: { extra?: { url?: string } } }) => void) | null = null;
    const LocalNotifications = {
      requestPermissions: async () => ({ display: "granted" }),
      getPending: async () => ({ notifications: [] }),
      cancel: vi.fn(),
      schedule: vi.fn(async () => ({})),
      addListener: vi.fn((_e: string, cb: typeof tapped) => { tapped = cb; return Promise.resolve({ remove() {} }); }),
    };
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true });
    (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "android", isNativePlatform: () => true, Plugins: { LocalNotifications } };

    render(<NativeAutoSync />);

    await waitFor(() => expect(LocalNotifications.schedule).toHaveBeenCalled());
    expect(dataRead).toHaveBeenCalledWith("reminders");
    const [{ notifications }] = LocalNotifications.schedule.mock.calls[0] as unknown as [{ notifications: { title: string }[] }];
    expect(notifications.map((n) => n.title)).toEqual(["Call mom", "Good morning"]);
    tapped!({ notification: { extra: { url: "/assistant?ask=hi" } } });
    expect(assign).toHaveBeenCalledWith("/assistant?ask=hi");
  });

  it("keeps what is already scheduled when the reminder list can't be read, and refreshes when the chat changes a reminder", async () => {
    const LocalNotifications = {
      requestPermissions: async () => ({ display: "granted" }),
      getPending: async () => ({ notifications: [{ id: 99 }] }),
      cancel: vi.fn(),
      schedule: vi.fn(async () => ({})),
      addListener: vi.fn(async () => ({ remove() {} })),
    };
    (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true, Plugins: { LocalNotifications } };
    dataRead.mockResolvedValueOnce(null);

    render(<NativeAutoSync />);
    await waitFor(() => expect(dataRead).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(LocalNotifications.cancel).not.toHaveBeenCalled();
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("jarvis:reminders"));
    await waitFor(() => expect(LocalNotifications.schedule).toHaveBeenCalled());
  });

  it("applies reminder refreshes in order, so a slow older read can't undo a newer one", async () => {
    const LocalNotifications = {
      requestPermissions: async () => ({ display: "granted" }),
      getPending: async () => ({ notifications: [] }),
      cancel: vi.fn(),
      schedule: vi.fn(async () => ({})),
      addListener: vi.fn(async () => ({ remove() {} })),
    };
    (window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true, Plugins: { LocalNotifications } };
    let finishFirst: (rows: unknown[]) => void = () => {};
    dataRead
      .mockImplementationOnce(() => new Promise((r) => { finishFirst = r; }))
      .mockResolvedValueOnce([{ id: "new", title: "New one", body: null, fire_at: "2999-01-01T09:00:00.000Z", status: "pending", recurrence: null }]);

    render(<NativeAutoSync />);
    await waitFor(() => expect(dataRead).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("jarvis:reminders"));
    finishFirst([]);
    await waitFor(() => expect(LocalNotifications.schedule).toHaveBeenCalledTimes(2));
    const last = LocalNotifications.schedule.mock.calls[1] as unknown as [{ notifications: { title: string }[] }];
    expect(last[0].notifications.map((n) => n.title)).toEqual(["New one", "Good morning"]);
  });

  it("does nothing in a browser", async () => {
    render(<NativeAutoSync />);
    await new Promise((r) => setTimeout(r, 20));
    expect(syncDeviceContacts).not.toHaveBeenCalled();
    expect(dataSave).not.toHaveBeenCalled();
  });
});
