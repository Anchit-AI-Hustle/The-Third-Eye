// True inside the native iOS/Android app or an iPhone home-screen app. Both
// sign in through /auth/handoff: a home-screen app keeps its own cookies,
// apart from Safari where Google sign-in finishes, and Google refuses sign-in
// inside the native app's web view.
export function inInstalledApp(): boolean {
  if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return true;
  return (navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}
