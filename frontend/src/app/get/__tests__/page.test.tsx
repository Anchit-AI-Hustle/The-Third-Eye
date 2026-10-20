import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GetPage from "@/app/get/page";
import { ANDROID_APK_URL, ANDROID_NATIVE_APK_URL, IOS_IPA_URL } from "@/lib/installPlatform";

describe("/get, the one link to send to a phone", () => {
  it("offers the Android app and both iPhone installs on one page", () => {
    render(<GetPage />);
    expect(screen.getByRole("link", { name: /Download for Android/i })).toHaveAttribute("href", ANDROID_APK_URL);
    expect(screen.getByRole("link", { name: /Native Android app/i })).toHaveAttribute("href", ANDROID_NATIVE_APK_URL);
    expect(screen.getByRole("link", { name: /Install on iPhone/i })).toHaveAttribute("href", "/install/jarvis.mobileconfig");
    expect(screen.getByRole("link", { name: /iPhone app file/i })).toHaveAttribute("href", IOS_IPA_URL);
  });
});
