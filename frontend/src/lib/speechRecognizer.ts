// The browser's own speech recognizer, or null where it can't be used.
//
// An iPhone home-screen app still exposes webkitSpeechRecognition, but it fails
// there ("service-not-allowed" or no results), and each start takes the
// microphone from getUserMedia, which silences the recorder that sends speech
// to /api/transcribe. In that mode voice runs on the recorder alone.

export function iosHomeScreenApp(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches === true);
  return ios && standalone;
}

export function speechRecognizer(): any | null {
  if (typeof window === "undefined" || iosHomeScreenApp()) return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
