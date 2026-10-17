// Which install path the /install page offers. Android gets the native APK
// from the android-latest release (android-apk.yml); iOS has no direct install
// outside the App Store, so Safari's Add to Home Screen is the path there.

export const ANDROID_APK_URL = "https://github.com/Anchit-AI-Hustle/The-Third-Eye/releases/download/android-latest/the-third-eye.apk";

export type InstallPlatform = "android" | "ios-safari" | "ios-other" | "desktop" | "installed";

export function installPlatform(ua: string, env: { touch: boolean; standalone: boolean }): InstallPlatform {
  if (env.standalone) return "installed";
  if (/Android/i.test(ua)) return "android";
  // iPadOS asks for the desktop site by default and reports itself as a Mac.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && env.touch);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua) ? "ios-other" : "ios-safari";
  return "desktop";
}
