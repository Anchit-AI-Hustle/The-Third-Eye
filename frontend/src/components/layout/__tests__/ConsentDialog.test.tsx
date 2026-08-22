import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConsentDialog } from "@/components/layout/ConsentDialog";
import * as consent from "@/lib/consent";

// Regression guard for the bug this dialog shipped with: granting a
// capability here only updated the dialog's own cosmetic ConsentState,
// never the always/ask policy layer every real feature (wake word, camera
// capture, location lookups) actually reads — so "Grant once, never asked
// again" was a promise nothing downstream honored.

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

const requestAll = vi.fn(async (keys: string[]) => {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = "granted";
  return out;
});

vi.mock("@/hooks/useConsent", () => ({
  useConsentBundle: () => ({ bundleAsked: false, requestAll }),
}));

describe("ConsentDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestAll.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets the always policy for every capability granted on Grant access", async () => {
    const setPolicySpy = vi.spyOn(consent, "setPolicy");
    render(<ConsentDialog />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    const grantBtn = screen.getByText("Grant access");
    await act(async () => {
      fireEvent.click(grantBtn);
    });

    expect(setPolicySpy).toHaveBeenCalledWith("microphone", "always");
    expect(setPolicySpy).toHaveBeenCalledWith("location", "always");
    expect(setPolicySpy).toHaveBeenCalledWith("notifications", "always");
    // Camera starts unchecked in this dialog, so it was never requested —
    // it must not be marked "always" either.
    expect(setPolicySpy).not.toHaveBeenCalledWith("camera", "always");
  });

  it("does not touch policy on Skip", async () => {
    const setPolicySpy = vi.spyOn(consent, "setPolicy");
    render(<ConsentDialog />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    const skipBtn = screen.getByText("Skip");
    await act(async () => {
      fireEvent.click(skipBtn);
    });

    expect(setPolicySpy).not.toHaveBeenCalled();
  });
});
