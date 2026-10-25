import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let user: { name: string; email: string } | null = { name: "Anchit Tandon", email: "a@x.com" };
vi.mock("next-auth/react", () => ({ useSession: () => (user ? { data: { user }, status: "authenticated" } : { data: null, status: "unauthenticated" }) }));

// Speech starts only when the browser allows it; a test flips that.
let allowed = true;
const spoken: string[] = [];
vi.mock("@/hooks/useVoice", () => ({
  useTTS: () => {
    const [speaking, setSpeaking] = useState(false);
    return {
      supported: true,
      speaking,
      speak: async (text: string) => { spoken.push(text); if (allowed) setSpeaking(true); },
    };
  },
}));

import { WelcomeVoice, welcomeLine } from "@/components/layout/WelcomeVoice";

beforeEach(() => { localStorage.clear(); spoken.length = 0; allowed = true; user = { name: "Anchit Tandon", email: "a@x.com" }; });
afterEach(() => vi.useRealTimers());

describe("the welcome on a new device", () => {
  it("greets the person by first name, aloud, right after signing in", () => {
    render(<WelcomeVoice />);
    expect(spoken).toEqual(["Welcome to The Third Eye, Anchit. I'm JARVIS, your assistant. Ask me anything, any time."]);
    expect(localStorage.getItem("te_welcomed_v1:a@x.com")).toBe("1");
  });

  it("only once per account on this device", () => {
    render(<WelcomeVoice />).unmount();
    render(<WelcomeVoice />);
    expect(spoken).toHaveLength(1);
  });

  it("greets a different account signing in on the same device", () => {
    render(<WelcomeVoice />).unmount();
    user = { name: "Priya Shah", email: "p@x.com" };
    render(<WelcomeVoice />);
    expect(spoken[1]).toContain("Priya");
  });

  it("waits for a tap when the browser blocks speech, then plays it", async () => {
    vi.useFakeTimers();
    allowed = false;
    render(<WelcomeVoice />);
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(screen.getByRole("button", { name: /Hear your welcome from JARVIS/ })).toBeInTheDocument();
    expect(localStorage.getItem("te_welcomed_v1:a@x.com")).toBeNull();

    allowed = true;
    await act(async () => { fireEvent.pointerDown(window); });
    expect(spoken).toHaveLength(2);
    expect(localStorage.getItem("te_welcomed_v1:a@x.com")).toBe("1");
    expect(screen.queryByRole("button", { name: /Hear your welcome/ })).toBeNull();
  });

  it("can be skipped without playing", async () => {
    vi.useFakeTimers();
    allowed = false;
    render(<WelcomeVoice />);
    await act(async () => { vi.advanceTimersByTime(1600); });
    fireEvent.click(screen.getByRole("button", { name: "Skip the welcome" }));
    expect(localStorage.getItem("te_welcomed_v1:a@x.com")).toBe("1");
    expect(screen.queryByRole("button", { name: /Hear your welcome/ })).toBeNull();
  });

  it("says nothing before anyone has signed in", () => {
    user = null;
    render(<WelcomeVoice />);
    expect(spoken).toEqual([]);
  });

  it("leaves the name out when there isn't one", () => {
    expect(welcomeLine(null, "FRIDAY")).toBe("Welcome to The Third Eye. I'm FRIDAY, your assistant. Ask me anything, any time.");
  });
});
