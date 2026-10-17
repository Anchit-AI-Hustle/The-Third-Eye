"use client";

import { useEffect, useRef } from "react";
import { useLocalContacts } from "@/hooks/useLocalContacts";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { dataSave } from "@/lib/dataClient";
import { autoSyncDue, deviceSyncPlugin, localStore, syncFolder, syncPhotos } from "@/lib/deviceSync";

// In the iPhone app: contacts, new photos and the granted folder sync on open
// and whenever the app comes back to the front (at most every ten minutes).
export function NativeAutoSync() {
  const { syncDeviceContacts } = useLocalContacts();
  const { upload } = useLocalKnowledge();
  const latest = useRef({ syncDeviceContacts, upload });
  latest.current = { syncDeviceContacts, upload };

  useEffect(() => {
    const plugin = deviceSyncPlugin();
    if (!plugin) return;
    let running = false;
    const run = async () => {
      if (running || document.visibilityState !== "visible" || !autoSyncDue(localStore)) return;
      running = true;
      try {
        await latest.current.syncDeviceContacts();
        await syncPhotos(plugin, async (rows) => (await dataSave("device_photos", rows)) === "saved", localStore);
        await syncFolder(plugin, async (files) => (await latest.current.upload(files)).length, localStore);
      } catch (err) {
        console.warn("Device sync stopped:", err);
      } finally {
        running = false;
      }
    };
    void run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, []);

  return null;
}
