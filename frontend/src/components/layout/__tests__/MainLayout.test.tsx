import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/goals" }));
vi.mock("../Sidebar", () => ({ Sidebar: () => <nav>sidebar</nav> }));
vi.mock("../BottomNav", () => ({ BottomNav: () => <nav>bottom nav</nav> }));
vi.mock("../../voice/VoiceOverlay", () => ({ VoiceOverlay: () => <div>voice</div> }));
vi.mock("../AiStatusBanner", () => ({ AiStatusBanner: () => null }));
vi.mock("../../hud/AmbientScene", () => ({ AmbientScene: () => null }));
vi.mock("../../hud/MotionNotice", () => ({ MotionNotice: () => null }));
vi.mock("../NativeAutoSync", () => ({ NativeAutoSync: () => null }));
vi.mock("../WelcomeVoice", () => ({ WelcomeVoice: () => null }));
vi.mock("@/hooks/useJarvisTriggers", () => ({ useJarvisTriggers: () => {} }));

import { MainLayout } from "../MainLayout";

afterEach(() => vi.unstubAllGlobals());

describe("MainLayout", () => {
  it("shows the website's menus in a browser", () => {
    render(<MainLayout><p>page</p></MainLayout>);
    expect(screen.getByText("sidebar")).toBeInTheDocument();
    expect(screen.getByText("bottom nav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("shows only the page inside the native app, which has its own tabs and menu", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: `${navigator.userAgent} TheThirdEyeApp/2` });
    render(<MainLayout><p>page</p></MainLayout>);
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByText("sidebar")).toBeNull();
    expect(screen.queryByText("bottom nav")).toBeNull();
    expect(screen.queryByText("voice")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open menu" })).toBeNull();
  });
});
