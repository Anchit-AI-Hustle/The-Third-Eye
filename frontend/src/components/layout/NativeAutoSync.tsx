"use client";

import { useEffect, useRef } from "react";
import { useLocalContacts } from "@/hooks/useLocalContacts";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { dataRead, dataSave } from "@/lib/dataClient";
import { autoSyncDue, deviceSyncPlugin, localStore, syncFolder, syncPhotos } from "@/lib/deviceSync";
import { REMINDERS_CHANGED, localNotificationsPlugin, scheduleOnPhone, type ReminderRow } from "@/lib/localReminders";

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
    // Reminders refresh on every return to the app and whenever the chat
    // changes one; the schedule is only replaced after a successful read, so
    // opening the app offline keeps what the phone already has.
    const refreshReminders = async () => {
      if (!notes) return;
      const rows = await dataRead<ReminderRow>("reminders");
      if (rows) await scheduleOnPhone(notes, rows);
    };
    let running = false;
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      void refreshReminders().catch((err) => console.warn("Reminder scheduling stopped:", err));
      if (!plugin || running || !autoSyncDue(localStore)) return;
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
    const onReminders = () => void refreshReminders().catch(() => {});
    void run();
    document.addEventListener("visibilitychange", run);
    window.addEventListener(REMINDERS_CHANGED, onReminders);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener(REMINDERS_CHANGED, onReminders);
      void tap?.then((l) => l.remove());
    };
  }, []);

  return null;
}
