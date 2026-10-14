"use client";

import { useState, useEffect, useCallback } from "react";

export interface DeviceContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  relationship?: string;
  notes?: string;
  source?: "device" | "manual" | "imported";
  updated_at: string;
}

const STORAGE_KEY = "jarvis_contacts_v1";

function loadLocalContacts(): DeviceContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalContacts(contacts: DeviceContact[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    window.dispatchEvent(new CustomEvent("jarvis:contacts", { detail: contacts }));
  } catch {}
}

export function useLocalContacts() {
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setContacts(loadLocalContacts());
    const onUpdate = (e: Event) => {
      setContacts((e as CustomEvent<DeviceContact[]>).detail ?? loadLocalContacts());
    };
    window.addEventListener("jarvis:contacts", onUpdate);
    return () => window.removeEventListener("jarvis:contacts", onUpdate);
  }, []);

  const addContact = useCallback((contact: Omit<DeviceContact, "id" | "updated_at">) => {
    setContacts((prev) => {
      const item: DeviceContact = {
        ...contact,
        id: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      };
      const next = [item, ...prev];
      saveLocalContacts(next);
      return next;
    });
  }, []);

  const removeContact = useCallback((id: string) => {
    setContacts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveLocalContacts(next);
      return next;
    });
  }, []);

  const syncDeviceContacts = useCallback(async (): Promise<{ count: number; error?: string }> => {
    setSyncing(true);
    try {
      const nav = navigator as any;
      if ("contacts" in nav && "ContactsManager" in window) {
        const props = ["name", "email", "tel"];
        const selected = await nav.contacts.select(props, { multiple: true });
        if (Array.isArray(selected) && selected.length > 0) {
          const imported: DeviceContact[] = selected.map((s: any) => ({
            id: crypto.randomUUID(),
            name: Array.isArray(s.name) ? s.name[0] : s.name || "Unknown",
            phone: Array.isArray(s.tel) ? s.tel[0] : s.tel || undefined,
            email: Array.isArray(s.email) ? s.email[0] : s.email || undefined,
            source: "device",
            updated_at: new Date().toISOString(),
          }));

          setContacts((prev) => {
            const existingPhones = new Set(prev.map((c) => c.phone?.replace(/\D/g, "")).filter(Boolean));
            const fresh = imported.filter((i) => !i.phone || !existingPhones.has(i.phone.replace(/\D/g, "")));
            const next = [...fresh, ...prev];
            saveLocalContacts(next);
            return next;
          });
          return { count: imported.length };
        }
      }
      return { count: 0, error: "Contacts Picker API is only available in Chrome/Android or supported browsers." };
    } catch (err: any) {
      return { count: 0, error: err?.message || "Sync cancelled or not allowed." };
    } finally {
      setSyncing(false);
    }
  }, []);

  return {
    contacts,
    syncing,
    addContact,
    removeContact,
    syncDeviceContacts,
  };
}
