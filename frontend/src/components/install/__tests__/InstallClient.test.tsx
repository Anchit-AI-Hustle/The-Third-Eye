import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallClient } from "@/components/install/InstallClient";

const as = (userAgent: string) => {
  vi.stubGlobal("navigator", { ...navigator, userAgent, maxTouchPoints: 0 });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
};
afterEach(() => vi.unstubAllGlobals());

describe("install page", () => {
  it("on a computer, shows one QR code and one short link for the phone", async () => {
    as("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15");
    render(<InstallClient />);
    const qr = await screen.findByRole("img", { name: /Scan to install/i });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText(/the-third-eye\.anchit-tandon\.com\/get/)).toBeInTheDocument();
  });

  it("on an iPhone, shows one install button and two short steps", async () => {
    as("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1");
    render(<InstallClient />);
    expect(await screen.findByRole("link", { name: /Install on iPhone/i })).toHaveAttribute("href", "/install/jarvis.mobileconfig");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
