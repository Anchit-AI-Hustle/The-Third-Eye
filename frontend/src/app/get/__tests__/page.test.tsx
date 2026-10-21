import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GetPage from "@/app/get/page";
import { ANDROID_APK_URL, ANDROID_NATIVE_APK_URL, IOS_IPA_URL } from "@/lib/installPlatform";

describe("/get, the one link to send to a phone", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers the Android app and both iPhone installs on one page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    render(await GetPage());
    expect(screen.getByRole("link", { name: /Download for Android/i })).toHaveAttribute("href", ANDROID_APK_URL);
    expect(screen.getByRole("link", { name: /Native Android app/i })).toHaveAttribute("href", ANDROID_NATIVE_APK_URL);
    expect(screen.getByRole("link", { name: /Install on iPhone/i })).toHaveAttribute("href", "/install/jarvis.mobileconfig");
    expect(screen.getByRole("link", { name: /iPhone app file/i })).toHaveAttribute("href", IOS_IPA_URL);
  });

  it("leaves out the native Android link until its release is published", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    render(await GetPage());
    expect(screen.queryByRole("link", { name: /Native Android app/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Download for Android/i })).toHaveAttribute("href", ANDROID_APK_URL);
  });

  it("leaves it out when GitHub can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    render(await GetPage());
    expect(screen.queryByRole("link", { name: /Native Android app/i })).toBeNull();
  });
});
