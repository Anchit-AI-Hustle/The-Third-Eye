const KEEP = /^(yes|no|ok|okay|hi|hey|bye|stop|help|はい|いいえ|うん|了解|ありがとう|お願い|さよなら)$/i;

export const UNHEARD = "I didn't catch that. Say it once more.";

// A one-token scrap from the speech recognizer — not a request. Sending it
// makes a working model return nothing, and the fallback then reports that
// as an outage.
export function isRecognizerNoise(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return true;
  if (KEEP.test(t)) return false;
  if (/\s/.test(t)) return false;
  if (/[a-z]{2,}/i.test(t)) return false;
  return t.length <= 8;
}
