"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

export interface DeviceContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  relationship?: string;
  notes?: string;
  source?: "device" | "manual" | "imported" | "vcf";
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

/** Robust vCard parser (v2.1, v3.0, v4.0) */
export function parseVCard(vcfText: string): Omit<DeviceContact, "id" | "updated_at">[] {
  const contacts: Omit<DeviceContact, "id" | "updated_at">[] = [];
  // Unfold lines: lines starting with space or tab are continuations
  const unfolded = vcfText.replace(/\r?\n[ \t]/g, "");
  const cards = unfolded.split(/BEGIN:VCARD/i);

  for (const card of cards) {
    if (!card.includes("END:VCARD")) continue;
    let name = "";
    let phone = "";
    let email = "";
    let notes = "";
    let relationship = "";

    const lines = card.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (/^FN[;: ]/i.test(line)) {
        name = line.replace(/^FN[^:]*:/i, "").trim();
      } else if (!name && /^N[;: ]/i.test(line)) {
        // N:Last;First;Middle;Prefix;Suffix
        const parts = line.replace(/^N[^:]*:/i, "").split(";").map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) name = `${parts[1]} ${parts[0]}`.trim();
        else if (parts.length === 1) name = parts[0];
      } else if (/^TEL[;: ]/i.test(line)) {
        const rawPhone = line.replace(/^TEL[^:]*:/i, "").replace(/^tel:/i, "").replace(/^uri:tel:/i, "").trim();
        if (!phone || /CELL|MOBILE|PREF/i.test(line)) {
          phone = rawPhone;
        }
      } else if (/^EMAIL[;: ]/i.test(line)) {
        const rawEmail = line.replace(/^EMAIL[^:]*:/i, "").trim();
        if (!email || /PREF/i.test(line)) {
          email = rawEmail;
        }
      } else if (/^NOTE[;: ]/i.test(line)) {
        notes = line.replace(/^NOTE[^:]*:/i, "").trim();
      } else if (/^(X-RELATIONSHIP|ROLE|TITLE)[;: ]/i.test(line)) {
        relationship = line.replace(/^[A-Z-]+[^:]*:/i, "").trim();
      }
    }

    name = name.replace(/\\([,;\\])/g, "$1").trim();
    phone = phone.replace(/^tel:/i, "").replace(/^["']|["']$/g, "").trim();

    if (name || phone || email) {
      contacts.push({
        name: name || phone || email || "Unknown Contact",
        phone: phone || undefined,
        email: email || undefined,
        relationship: relationship || undefined,
        notes: notes || undefined,
        source: "vcf",
      });
    }
  }

  return contacts;
}

/** Parses CSV formatted contacts */
export function parseCSVContacts(csvText: string): Omit<DeviceContact, "id" | "updated_at">[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const nameIdx = headers.findIndex((h) => h.includes("name"));
  const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("mobile") || h.includes("tel"));
  const emailIdx = headers.findIndex((h) => h.includes("email"));
  const relIdx = headers.findIndex((h) => h.includes("relationship") || h.includes("tag") || h.includes("role"));

  const results: Omit<DeviceContact, "id" | "updated_at">[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
    const phone = phoneIdx >= 0 ? cols[phoneIdx] : cols[1];
    const email = emailIdx >= 0 ? cols[emailIdx] : undefined;
    const rel = relIdx >= 0 ? cols[relIdx] : undefined;

    if (name || phone) {
      results.push({
        name: name || phone || "Unknown",
        phone: phone || undefined,
        email: email || undefined,
        relationship: rel || undefined,
        source: "imported",
      });
    }
  }
  return results;
}

export function hasNativeContactsPicker(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as any;
  return !!("contacts" in nav && "ContactsManager" in window);
}

export function useLocalContacts() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;

  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Sync to remote cloud API
  const pushToCloud = useCallback(async (list: DeviceContact[]) => {
    if (!userId) return;
    try {
      await fetch("/api/user/sync/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: list }),
      });
    } catch {}
  }, [userId]);

  // Initial load: local first, then merge cloud
  useEffect(() => {
    const local = loadLocalContacts();
    setContacts(local);

    const onUpdate = (e: Event) => {
      setContacts((e as CustomEvent<DeviceContact[]>).detail ?? loadLocalContacts());
    };
    window.addEventListener("jarvis:contacts", onUpdate);

    // If logged in, fetch cloud contacts and merge
    if (userId) {
      fetch("/api/user/sync/contacts")
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok && Array.isArray(data.contacts) && data.contacts.length > 0) {
            setContacts((prev) => {
              const currentPhones = new Set(prev.map((c) => c.phone?.replace(/\D/g, "")).filter(Boolean));
              const currentNames = new Set(prev.map((c) => c.name.toLowerCase().trim()));

              const freshFromCloud = (data.contacts as DeviceContact[]).filter((c) => {
                const p = c.phone?.replace(/\D/g, "");
                const n = c.name.toLowerCase().trim();
                return (!p || !currentPhones.has(p)) && !currentNames.has(n);
              });

              if (freshFromCloud.length > 0) {
                const merged = [...prev, ...freshFromCloud];
                saveLocalContacts(merged);
                return merged;
              }
              return prev;
            });
          } else if (local.length > 0) {
            // Upload local contacts to cloud on first sync
            pushToCloud(local);
          }
        })
        .catch(() => {});
    }

    return () => window.removeEventListener("jarvis:contacts", onUpdate);
  }, [userId, pushToCloud]);

  const addContact = useCallback((contact: Omit<DeviceContact, "id" | "updated_at">) => {
    setContacts((prev) => {
      const item: DeviceContact = {
        ...contact,
        id: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      };
      const next = [item, ...prev];
      saveLocalContacts(next);
      pushToCloud(next);
      return next;
    });
  }, [pushToCloud]);

  const removeContact = useCallback((id: string) => {
    setContacts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveLocalContacts(next);
      pushToCloud(next);
      return next;
    });
  }, [pushToCloud]);

  const importBatch = useCallback((items: Omit<DeviceContact, "id" | "updated_at">[]) => {
    if (!items.length) return 0;
    const current = loadLocalContacts();
    const existingPhones = new Set(current.map((c) => c.phone?.replace(/\D/g, "")).filter(Boolean));
    const existingNames = new Set(current.map((c) => c.name.toLowerCase().trim()));

    const fresh: DeviceContact[] = [];
    const now = new Date().toISOString();

    for (const item of items) {
      const cleanP = item.phone?.replace(/\D/g, "");
      const cleanN = item.name.toLowerCase().trim();
      if ((cleanP && existingPhones.has(cleanP)) || (cleanN && existingNames.has(cleanN))) {
        continue;
      }
      if (cleanP) existingPhones.add(cleanP);
      if (cleanN) existingNames.add(cleanN);

      fresh.push({
        ...item,
        id: crypto.randomUUID(),
        updated_at: now,
      });
    }

    if (fresh.length > 0) {
      const next = [...fresh, ...current];
      saveLocalContacts(next);
      setContacts(next);
      pushToCloud(next);
    }

    return fresh.length;
  }, [pushToCloud]);

  const importContactsFromFile = useCallback(async (file: File): Promise<{ count: number; error?: string }> => {
    setSyncing(true);
    try {
      const text = await file.text();
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      let parsed: Omit<DeviceContact, "id" | "updated_at">[] = [];

      if (ext === ".vcf" || ext === ".vcard" || text.includes("BEGIN:VCARD")) {
        parsed = parseVCard(text);
      } else if (ext === ".csv") {
        parsed = parseCSVContacts(text);
      } else {
        // Try vcard then CSV
        parsed = parseVCard(text);
        if (!parsed.length) parsed = parseCSVContacts(text);
      }

      if (!parsed.length) {
        return { count: 0, error: "No contacts could be found in this file. Please ensure it is a .vcf (vCard) or .csv file." };
      }

      const count = importBatch(parsed);
      return { count };
    } catch (err: any) {
      return { count: 0, error: err?.message || "Failed to read contact file." };
    } finally {
      setSyncing(false);
    }
  }, [importBatch]);

  const syncDeviceContacts = useCallback(async (): Promise<{ count: number; supported: boolean; error?: string }> => {
    setSyncing(true);
    try {
      const nav = navigator as any;
      if ("contacts" in nav && "ContactsManager" in window) {
        const props = ["name", "email", "tel"];
        const selected = await nav.contacts.select(props, { multiple: true });
        if (Array.isArray(selected) && selected.length > 0) {
          const imported: Omit<DeviceContact, "id" | "updated_at">[] = selected.map((s: any) => ({
            name: Array.isArray(s.name) ? s.name[0] : s.name || "Unknown",
            phone: Array.isArray(s.tel) ? s.tel[0] : s.tel || undefined,
            email: Array.isArray(s.email) ? s.email[0] : s.email || undefined,
            source: "device",
          }));

          const count = importBatch(imported);
          return { count, supported: true };
        }
        return { count: 0, supported: true };
      }

      // Not supported natively on this browser (e.g. iOS Safari, Firefox, Mac Safari)
      return {
        count: 0,
        supported: false,
        error: "Native Contacts Picker is available in Chrome/Android. On iOS / Mac / Safari, use the 'Import Contacts (.vcf / iCloud)' button below.",
      };
    } catch (err: any) {
      return { count: 0, supported: true, error: err?.message || "Sync cancelled or not allowed." };
    } finally {
      setSyncing(false);
    }
  }, [importBatch]);

  const refreshFromCloud = useCallback(async (): Promise<{ count: number; error?: string }> => {
    setSyncing(true);
    try {
      const local = loadLocalContacts();
      if (!userId) {
        setContacts(local);
        return { count: local.length };
      }
      const res = await fetch("/api/user/sync/contacts");
      if (!res.ok) {
        return { count: local.length, error: `Cloud sync returned status ${res.status}` };
      }
      const data = await res.json();
      const cloudContacts: DeviceContact[] = Array.isArray(data?.contacts) ? data.contacts : [];

      const phoneMap = new Map<string, DeviceContact>();
      const nameMap = new Map<string, DeviceContact>();

      for (const c of cloudContacts) {
        if (c.phone) phoneMap.set(c.phone.replace(/\D/g, ""), c);
        if (c.name) nameMap.set(c.name.toLowerCase().trim(), c);
      }

      const toUpload: DeviceContact[] = [];
      for (const l of local) {
        const cleanP = l.phone?.replace(/\D/g, "");
        const cleanN = l.name.toLowerCase().trim();
        const hasPhone = cleanP && phoneMap.has(cleanP);
        const hasName = cleanN && nameMap.has(cleanN);
        if (!hasPhone && !hasName) {
          toUpload.push(l);
          if (cleanP) phoneMap.set(cleanP, l);
          if (cleanN) nameMap.set(cleanN, l);
        }
      }

      const merged = [...cloudContacts, ...toUpload];
      saveLocalContacts(merged);
      setContacts(merged);

      if (toUpload.length > 0 || (cloudContacts.length === 0 && local.length > 0)) {
        await pushToCloud(merged);
      }

      return { count: merged.length };
    } catch (err: any) {
      return { count: loadLocalContacts().length, error: err?.message || "Cloud contact sync failed." };
    } finally {
      setSyncing(false);
    }
  }, [userId, pushToCloud]);

  const seedEssentialContacts = useCallback(() => {
    const essentials: Omit<DeviceContact, "id" | "updated_at">[] = [
      { name: "Mom", phone: "+91 98765 43210", relationship: "Family", notes: "Primary emergency contact", source: "manual" },
      { name: "Dad", phone: "+91 98765 43211", relationship: "Family", notes: "Family contact", source: "manual" },
      { name: "Rohit Sharma", phone: "+91 98739 45238", relationship: "Work / Friend", notes: "WhatsApp contact", source: "manual" },
      { name: "Aviral Vahdam", phone: "+91 98111 22334", relationship: "Colleague", notes: "Work & messaging", source: "manual" },
      { name: "Emergency Dispatch", phone: "112", relationship: "Emergency", notes: "National emergency line", source: "manual" },
    ];
    return importBatch(essentials);
  }, [importBatch]);

  return {
    contacts,
    syncing,
    addContact,
    removeContact,
    importBatch,
    importContactsFromFile,
    syncDeviceContacts,
    refreshFromCloud,
    seedEssentialContacts,
    hasNativePicker: hasNativeContactsPicker(),
  };
}
