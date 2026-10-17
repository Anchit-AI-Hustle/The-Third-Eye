"use client";

import { useEffect, useRef } from "react";
import { useLocalContacts } from "@/hooks/useLocalContacts";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { dataList, dataSave } from "@/lib/dataClient";
import { autoSyncDue, deviceSyncPlugin, localStore, syncFolder, syncPhotos } from "@/lib/deviceSync";
import { localNotificationsPlugin, scheduleOnPhone, type ReminderRow } from "@/lib/localReminders";

// In the phone app: contacts, new photos and the granted folder sync on open
// and whenever the app comes back to the front (at most every ten minutes),
// and reminders plus the morning briefing are scheduled on the phone.
export function NativeAutoSync() {
  const { syncDeviceContacts } = useLocalContacts();
  const { upload } = useLocalKnowledge();
  const latest = useRef({ syncDeviceContacts, upload });
  latest.current = { syncDeviceContacts, upload };

  useEffect(() => {
    const plugin = deviceSyncPlugin();
    const notes = localNotificationsPlugin();
    if (!plugin && !notes) return;
    const tap = notes?.addListener("localNotificationActionPerformed", (a) => {
      const url = a.notification.extra?.url;
      if (url) window.location.assign(url);
    });
    let running = false;
    const run = async () => {
      if (running || document.visibilityState !== "visible" || !autoSyncDue(localStore)) return;
      running = true;
      try {
        if (plugin) {
          await latest.current.syncDeviceContacts();
          await syncPhotos(plugin, async (rows) => (await dataSave("device_photos", rows)) === "saved", localStore);
          await syncFolder(plugin, async (files) => (await latest.current.upload(files)).length, localStore);
        }
        if (notes) await scheduleOnPhone(notes, (await dataList<ReminderRow>("reminders")).rows);
      } catch (err) {
        console.warn("Device sync stopped:", err);
      } finally {
        running = false;
      }
    };
    void run();
    document.addEventListener("visibilitychange", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      void tap?.then((l) => l.remove());
    };
  }, []);

  return null;
}
