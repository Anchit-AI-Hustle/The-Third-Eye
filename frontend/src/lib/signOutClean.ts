import { signOut } from "next-auth/react";

// Personal data cached on this browser: tasks, notes, goals, knowledge, chat
// history and memory (jarvis_), Studio generations (te_vault:), Life Log
// transcripts, Music Studio tracks and Book drafts. Life Log audio stays: it
// exists only on this device, so wiping it would lose the recordings. On a shared
// machine it would outlive the session and show to the next person, so all of
// it goes on sign-out. Anything synced is still in the database.
const PERSONAL_PREFIXES = ["jarvis_", "te_vault:", "te_lifelog", "te_music_tracks", "book-studio:", "te_pending_skill_run"];

export function clearSensitiveLocalData(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && PERSONAL_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage may be unavailable (private mode / quota); best effort */
  }
}

// Drop-in replacement for next-auth's signOut that first wipes local PII.
export function signOutAndClear(options?: Parameters<typeof signOut>[0]) {
  clearSensitiveLocalData();
  return signOut(options);
}
