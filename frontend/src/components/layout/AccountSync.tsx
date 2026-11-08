"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { getDeviceId } from "@/lib/deviceVault";
import { cloudKey, localKey, MAX_VALUE_CHARS } from "@/lib/account/syncKeys";

// Keeps the person's settings and on-device app data the same on every device
// they sign in on. Writes to account-level keys (lib/account/syncKeys.ts) are
// sent to /api/prefs; on sign-in and whenever the app comes back into view the
// account's newer values are applied here. Newest write wins, per key.

const STAMPS = "te_sync_stamps_v1";
const OWNER = "te_sync_owner_v1";
// Set while sign-out clears this device, so clearing it never deletes the account's copy.
export const pauseAccountSync = () => { (window as { __teSyncPaused?: boolean }).__teSyncPaused = true; };
const paused = () => (window as { __teSyncPaused?: boolean }).__teSyncPaused === true;
const PUSH_MS = 1_500;
const PULL_EVERY_MS = 60_000;

type Stamps = Record<string, number>;
const readStamps = (): Stamps => { try { return JSON.parse(localStorage.getItem(STAMPS) ?? "{}"); } catch { return {}; } };

export function AccountSync() {
  const { data: session, status } = useSession();
  const email = session?.user?.email?.toLowerCase();

  useEffect(() => {
    if (status !== "authenticated" || !email || typeof window === "undefined") return;
    const store = window.localStorage;
    const proto = Object.getPrototypeOf(store) as Storage;
    const origSet = proto.setItem;
    const origRemove = proto.removeItem;
    const device = getDeviceId();
    // Values left by a different account on this device are never sent to this one.
    const sameOwner = store.getItem(OWNER) === email;
    if (!sameOwner) { origSet.call(store, OWNER, email); origSet.call(store, STAMPS, "{}"); }
    let stamps = readStamps();
    const firstSyncHere = Object.keys(stamps).length === 0;
    const dirty = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPull = 0;
    let stopped = false;

    const saveStamps = () => origSet.call(store, STAMPS, JSON.stringify(stamps));

    const push = async () => {
      timer = null;
      const keys = [...dirty];
      dirty.clear();
      const items = keys.flatMap((local) => {
        const key = cloudKey(local);
        const value = store.getItem(local);
        if (!key || (value !== null && value.length > MAX_VALUE_CHARS)) return [];
        return [{ key, value, updatedAt: stamps[local] ?? Date.now() }];
      });
      if (!items.length) return;
      const ok = await fetch("/api/prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) }).then((r) => r.ok).catch(() => false);
      if (!ok) keys.forEach((k) => dirty.add(k)); // retried on the next write or pull
    };
    const schedule = (local: string) => {
      if (paused()) return;
      stamps[local] = Date.now();
      saveStamps();
      dirty.add(local);
      if (!timer) timer = setTimeout(() => void push(), PUSH_MS);
    };

    // Every write to an account-level key is recorded and sent.
    proto.setItem = function (this: Storage, key: string, value: string) {
      origSet.call(this, key, value);
      if (this === store && cloudKey(key)) schedule(key);
    };
    proto.removeItem = function (this: Storage, key: string) {
      origRemove.call(this, key);
      if (this === store && cloudKey(key)) schedule(key);
    };

    const pull = async () => {
      if (stopped || Date.now() - lastPull < PULL_EVERY_MS / 4) return;
      lastPull = Date.now();
      const r = await fetch("/api/prefs").then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!r || stopped || !Array.isArray(r.items)) return;
      const inCloud = new Set<string>();
      const changed: string[] = [];
      for (const item of r.items as { key: string; value: string | null; updatedAt: number }[]) {
        const local = localKey(item.key, device);
        if (!local) continue;
        inCloud.add(local);
        if ((stamps[local] ?? 0) >= item.updatedAt || dirty.has(local)) continue;
        if (store.getItem(local) !== item.value) {
          if (item.value === null) origRemove.call(store, local); else origSet.call(store, local, item.value);
          changed.push(local);
        }
        stamps[local] = item.updatedAt;
      }
      // What this device has that the account doesn't yet (data from before
      // sync, or written while offline) goes up, when it is this account's.
      for (let i = 0; sameOwner && i < store.length; i++) {
        const k = store.key(i);
        if (k && cloudKey(k) && !inCloud.has(k) && !dirty.has(k)) { stamps[k] = stamps[k] ?? Date.now(); dirty.add(k); }
      }
      saveStamps();
      if (dirty.size && !timer) timer = setTimeout(() => void push(), PUSH_MS);
      if (!changed.length) return;
      for (const key of changed) window.dispatchEvent(new StorageEvent("storage", { key }));
      window.dispatchEvent(new CustomEvent("te:account-sync", { detail: changed }));
      // A device signing in for the first time has already drawn its screens
      // from empty storage: reload once so everything starts from the account.
      if (firstSyncHere && !sessionStorage.getItem("te_account_synced")) {
        sessionStorage.setItem("te_account_synced", "1");
        window.location.reload();
      }
    };

    void pull();
    const onVisible = () => { if (document.visibilityState === "visible") void pull(); };
    document.addEventListener("visibilitychange", onVisible);
    const every = setInterval(() => { if (document.visibilityState === "visible") void pull(); }, PULL_EVERY_MS);

    return () => {
      stopped = true;
      proto.setItem = origSet;
      proto.removeItem = origRemove;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(every);
      if (timer) { clearTimeout(timer); void push(); }
      stamps = {};
    };
  }, [status, email]);

  return null;
}
