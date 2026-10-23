import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStartRedirect } from "../AppStartRedirect";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

afterEach(() => {
  replace.mockClear();
  delete (window as { Capacitor?: unknown }).Capacitor;
});

describe("AppStartRedirect", () => {
  it("sends the installed app past the marketing page to sign-in", () => {
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    render(<AppStartRedirect />);
    expect(replace).toHaveBeenCalledWith("/auth/signin");
  });

  it("leaves the website's landing page alone in a browser", () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
    render(<AppStartRedirect />);
    expect(replace).not.toHaveBeenCalled();
  });
});
