// Which install path the /install page offers. Android gets the native APK
// from the android-latest release (android-apk.yml). iOS installs only signed
// apps, so iPhones get Safari's Add to Home Screen, with the native .ipa from
// the ios-latest release (ios-app.yml) for signing with a sideloader.

export const ANDROID_APK_URL = "https://github.com/Anchit-AI-Hustle/The-Third-Eye/releases/download/android-latest/the-third-eye.apk";
export const IOS_IPA_URL = "https://github.com/Anchit-AI-Hustle/The-Third-Eye/releases/download/ios-latest/the-third-eye.ipa";

export type InstallPlatform = "android" | "ios-safari" | "ios-other" | "desktop" | "installed";

export function installPlatform(ua: string, env: { touch: boolean; standalone: boolean }): InstallPlatform {
  if (env.standalone) return "installed";
  if (/Android/i.test(ua)) return "android";
  // iPadOS asks for the desktop site by default and reports itself as a Mac.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && env.touch);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua) ? "ios-other" : "ios-safari";
  return "desktop";
}
