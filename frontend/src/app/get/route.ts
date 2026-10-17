import { ANDROID_APK_URL, installPlatform } from "@/lib/installPlatform";

// One short link for any phone: Android gets the app, an iPhone in Safari
// gets the home-screen install, anything else the install page.
export function GET(req: Request) {
  const platform = installPlatform(req.headers.get("user-agent") ?? "", { touch: false, standalone: false });
  const to = platform === "android" ? ANDROID_APK_URL
    : platform === "ios-safari" ? new URL("/install/jarvis.mobileconfig", req.url).toString()
    : new URL("/install", req.url).toString();
  return Response.redirect(to, 307);
}
