"use client";

import { PermissionCapability, getPolicy } from "@/lib/consent";

// Module-level bridge so *any* code — hooks, non-React libs, background bridges —
// can go through the same permission gate the UI renders, without threading a
// React context everywhere. PermissionProvider registers its sheet opener here
// on mount.
//
//   const ok = await ensureCapability("microphone");
//   if (!ok) return;   // user chose "Not now" / hasn't granted
//
// "always" resolves instantly (never re-ask); anything else shows the sheet.

type Opener = (cap: PermissionCapability) => Promise<boolean>;

let opener: Opener | null = null;

export function registerPermissionUI(fn: Opener): () => void {
  opener = fn;
  return () => { if (opener === fn) opener = null; };
}

export async function ensureCapability(cap: PermissionCapability): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (getPolicy(cap) === "always") return true;
  if (opener) return opener(cap);
  // No UI mounted to ask with — do not silently grant.
  return false;
}
