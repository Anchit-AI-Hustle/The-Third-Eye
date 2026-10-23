import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dataClient", () => ({ dataUpdate: vi.fn(async () => true), dataDelete: vi.fn(async () => true) }));
import { AutomationsCard } from "@/components/settings/AutomationsCard";
import { REMINDERS_CHANGED } from "@/lib/localReminders";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("automations in Settings", () => {
  it("tells the phone app to reschedule after a pause or a delete", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ automations: [
      { id: "a1", name: "Water plants", action: "remind", fireAt: "2999-01-01T09:00:00Z", recurrence: "daily", status: "pending", lastRun: null },
    ] })));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const changed = vi.fn();
    window.addEventListener(REMINDERS_CHANGED, changed);

    render(<AutomationsCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Pause Water plants" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Delete Water plants" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));

    window.removeEventListener(REMINDERS_CHANGED, changed);
  });
});
