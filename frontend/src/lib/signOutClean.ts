import { signOut } from "next-auth/react";

// Tasks, notes, goals, expenses, knowledge, chat history and the assistant
// "memory" are cached in localStorage under the `jarvis_` prefix, keyed by
// email. On a shared machine that data would outlive the session, so we clear
// every `jarvis_`-prefixed key on sign-out. (Server/Supabase remains the source
// of truth — nothing is lost, only the local plaintext copy.)
export function clearSensitiveLocalData(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("jarvis_")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage may be unavailable (private mode / quota) — best effort */
  }
}

// Drop-in replacement for next-auth's signOut that first wipes local PII.
export function signOutAndClear(options?: Parameters<typeof signOut>[0]) {
  clearSensitiveLocalData();
  return signOut(options);
}
