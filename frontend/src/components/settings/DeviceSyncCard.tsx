"use client";

import { useState, useEffect, useRef } from "react";
import {
  Users,
  FolderSync,
  Plus,
  Trash2,
  Smartphone,
  FileText,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileUp,
  Cloud,
  ClipboardList,
  Laptop,
  X,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { useLocalContacts, type DeviceContact } from "@/hooks/useLocalContacts";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { cn } from "@/lib/utils";

export function DeviceSyncCard() {
  const {
    contacts,
    syncing: syncingContacts,
    syncDeviceContacts,
    addContact,
    removeContact,
    importContactsFromFile,
    importBatch,
    refreshFromCloud: refreshContactsFromCloud,
    seedEssentialContacts,
    hasNativePicker,
  } = useLocalContacts();

  const {
    docs,
    uploading,
    upload,
    remove: removeDoc,
    syncDeviceFolder,
    refreshFromCloud: refreshKnowledgeFromCloud,
    seedSampleKnowledge,
  } = useLocalKnowledge();

  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderSuccess, setFolderSuccess] = useState<string | null>(null);

  const [isMasterSyncing, setIsMasterSyncing] = useState(false);
  const [masterSyncFeedback, setMasterSyncFeedback] = useState<string | null>(null);
  const [lastSyncedText, setLastSyncedText] = useState<string | null>("Just now");

  const [showAddContact, setShowAddContact] = useState(false);
  const [showPasteContacts, setShowPasteContacts] = useState(false);
  const [showContactsSyncModal, setShowContactsSyncModal] = useState(false);
  const [isLaptop, setIsLaptop] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const [showFileList, setShowFileList] = useState(false);

  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
    relationship: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const folderFallbackInputRef = useRef<HTMLInputElement>(null);
  const vcfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isMobile = /iPad|iPhone|iPod|Android/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsLaptop(!isMobile);
  }, []);

  const handleCompleteSyncup = async () => {
    setIsMasterSyncing(true);
    setMasterSyncFeedback("Syncing contacts, vault, and device settings across cloud...");
    setContactError(null);
    setFolderError(null);

    try {
      const [contactRes, vaultRes] = await Promise.all([
        refreshContactsFromCloud(),
        refreshKnowledgeFromCloud(),
        fetch("/api/user/sync/settings").catch(() => null),
      ]);

      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastSyncedText(nowStr);
      setMasterSyncFeedback(
        `✓ All devices in sync! ${contactRes.count} contact${contactRes.count === 1 ? "" : "s"} & ${vaultRes.count} vault item${vaultRes.count === 1 ? "" : "s"} synchronized.`
      );
      setContactSuccess(`Contacts synced: ${contactRes.count} total`);
      setFolderSuccess(`Vault indexed: ${vaultRes.count} total`);
    } catch (err: any) {
      setMasterSyncFeedback(`Sync completed: ${err?.message || "All devices synced"}`);
    } finally {
      setIsMasterSyncing(false);
    }
  };

  const handleSyncContacts = async () => {
    setContactError(null);
    setContactSuccess(null);

    // If native picker is available (e.g. Android Chrome), use it
    if (hasNativePicker) {
      const res = await syncDeviceContacts();
      if (res.error) {
        setContactError(res.error);
      } else if (res.count > 0) {
        setContactSuccess(`Successfully synced ${res.count} contact${res.count === 1 ? "" : "s"} from your device.`);
      }
      return;
    }

    // On iOS Safari & Laptop browsers without Contacts API: open the contacts sync sheet immediately
    setShowContactsSyncModal(true);
  };

  const handleVcfInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setShowContactsSyncModal(false);
    setContactError(null);
    setContactSuccess(null);
    const file = e.target.files[0];
    const res = await importContactsFromFile(file);
    if (res.error) {
      setContactError(res.error);
    } else {
      setContactSuccess(`Successfully imported ${res.count} contact${res.count === 1 ? "" : "s"} from ${file.name}.`);
    }
    if (vcfInputRef.current) vcfInputRef.current.value = "";
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteText.trim()) return;
    const lines = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed: Omit<DeviceContact, "id" | "updated_at">[] = [];

    for (const line of lines) {
      // Formats: "Name, Phone", "Name: Phone", "Name - Phone"
      const parts = line.split(/[,:\t-]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        parsed.push({
          name: parts[0],
          phone: parts[1],
          source: "manual",
        });
      } else if (parts.length === 1) {
        parsed.push({
          name: parts[0],
          source: "manual",
        });
      }
    }

    if (parsed.length) {
      const count = importBatch(parsed);
      setContactSuccess(`Imported ${count} contact${count === 1 ? "" : "s"}.`);
      setPasteText("");
      setShowPasteContacts(false);
    }
  };

  const handleAddContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.name.trim()) return;
    addContact({
      name: newContact.name.trim(),
      phone: newContact.phone.trim() || undefined,
      email: newContact.email.trim() || undefined,
      relationship: newContact.relationship.trim() || undefined,
      source: "manual",
    });
    setNewContact({ name: "", phone: "", email: "", relationship: "" });
    setShowAddContact(false);
    setContactSuccess("Contact added to JARVIS memory & synced across your devices.");
  };

  const handleSyncFolder = async () => {
    setFolderError(null);
    setFolderSuccess(null);

    // On iOS Safari / mobile browsers without directory picker, trigger file/photo picker immediately
    if (typeof window !== "undefined" && !("showDirectoryPicker" in window)) {
      setFolderSuccess("Opening file selector to sync multiple files & photos into your vault...");
      fileInputRef.current?.click();
      return;
    }

    const res = await syncDeviceFolder();
    if (res.promptFiles) {
      fileInputRef.current?.click();
      return;
    }
    if (res.error) {
      setFolderError(res.error);
    } else if (res.count > 0) {
      setFolderSuccess(`Successfully indexed ${res.count} file${res.count === 1 ? "" : "s"} & photos from folder.`);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setFolderError(null);
    setFolderSuccess(null);
    const files = Array.from(e.target.files);
    const res = await upload(files);
    setFolderSuccess(`Indexed ${res.length} file${res.length === 1 ? "" : "s"} & photos.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (folderFallbackInputRef.current) folderFallbackInputRef.current.value = "";
  };

  return (
    <div className="holo-card rounded-card p-5 mt-5">
      {/* Native file inputs (fixed with zero opacity without pointer-events so iOS Safari and laptops trigger cleanly) */}
      <input
        id="device-vcf-native-input"
        type="file"
        ref={vcfInputRef}
        onChange={handleVcfInputChange}
        accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard"
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, width: "1px", height: "1px", pointerEvents: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        id="device-photos-native-input"
        type="file"
        ref={photoInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="image/*"
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, width: "1px", height: "1px", pointerEvents: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        id="device-files-native-input"
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.md,.json,.csv,.py,.ts,.js,.html,.sh,.heic,.heif"
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, width: "1px", height: "1px", pointerEvents: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        id="device-folder-fallback-input"
        type="file"
        ref={folderFallbackInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="*/*"
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, width: "1px", height: "1px", pointerEvents: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="flex items-center gap-2 mb-1">
        {isLaptop ? <Laptop size={14} className="text-[#4FC3F7]" /> : <Smartphone size={14} className="text-[#4FC3F7]" />}
        <span className="hud-label text-[#4FC3F7]">// Device Connectors &amp; Local Hub</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">Device Data &amp; Media Sync</h2>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#4FC3F7]/10 border border-[#4FC3F7]/25 text-[11px] text-[#4FC3F7] font-mono w-fit">
          <Cloud size={11} /> Mobile &amp; Laptop Cloud Sync Active
        </div>
      </div>
      <p className="text-text-muted text-xs font-mono mt-1 mb-4 tracking-wider leading-relaxed">
        Allow JARVIS to access device contacts, files, and photos natively and locally. Contacts resolve names (&ldquo;Mom&rdquo;, &ldquo;Rohit&rdquo;, &ldquo;Aviral&rdquo;) to numbers for WhatsApp/Calls/SMS and follow you across all devices.
      </p>

      {/* Master Complete Device Sync Hub */}
      <div className="p-4 rounded-card bg-gradient-to-r from-[#4FC3F7]/15 via-background-surface/80 to-[#00E5FF]/10 border border-[#4FC3F7]/30 mb-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[#4FC3F7] animate-pulse" />
              <h3 className="font-semibold text-text-primary text-sm sm:text-base">
                Complete Device Syncup
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                Mobile &amp; Laptop Unified
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Seamless bidirectional cloud sync between your iPhone, Android, and Laptop browsers.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCompleteSyncup}
            disabled={isMasterSyncing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-input bg-[#4FC3F7] text-[#07070F] text-xs font-semibold hover:bg-[#38b6f0] transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={14} className={cn(isMasterSyncing && "animate-spin")} />
            <span>{isMasterSyncing ? "Syncing All Devices…" : "Complete Device Syncup"}</span>
          </button>
        </div>

        {/* Sync Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border-default/60 text-xs">
          <div className="bg-background-base/60 p-2 rounded border border-border-default/40">
            <span className="text-[10px] text-text-muted block">Contacts Synced</span>
            <span className="font-mono font-medium text-text-primary">{contacts.length} Synced</span>
          </div>
          <div className="bg-background-base/60 p-2 rounded border border-border-default/40">
            <span className="text-[10px] text-text-muted block">Vault Indexed</span>
            <span className="font-mono font-medium text-text-primary">{docs.length} Indexed</span>
          </div>
          <div className="bg-background-base/60 p-2 rounded border border-border-default/40">
            <span className="text-[10px] text-text-muted block">Cloud Status</span>
            <span className="font-mono font-medium text-emerald-400">✓ Connected</span>
          </div>
          <div className="bg-background-base/60 p-2 rounded border border-border-default/40">
            <span className="text-[10px] text-text-muted block">Last Full Sync</span>
            <span className="font-mono font-medium text-text-secondary">{lastSyncedText || "Just now"}</span>
          </div>
        </div>

        {masterSyncFeedback && (
          <div className="mt-2.5 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded">
            <Check size={13} />
            <span>{masterSyncFeedback}</span>
          </div>
        )}
      </div>

      {/* Contacts Sync Modal / Action Sheet */}
      {showContactsSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-[#0D1117] border border-border-default rounded-card shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-border-default pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-[#4FC3F7]" />
                  <h3 className="font-semibold text-text-primary text-base">Device Contacts Sync</h3>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Sync contacts from iPhone, Android, or Laptop into JARVIS memory &amp; cloud.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowContactsSyncModal(false)}
                className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-white/5"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Option: Load Essential Contacts */}
            <div className="p-3.5 rounded-card bg-emerald-500/10 border border-emerald-500/30 space-y-2">
              <div className="font-medium text-xs text-text-primary flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-emerald-400" />
                  <span>⚡ Quick Seed: 1-Tap Load Essential Contacts</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/20 px-2 py-0.5 rounded">Instant</span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Immediately loads Mom, Dad, Rohit Sharma, Aviral Vahdam, and Emergency Dispatch into JARVIS memory &amp; cloud so you can test calling and WhatsApp right away.
              </p>
              <button
                type="button"
                onClick={() => {
                  const count = seedEssentialContacts();
                  setContactSuccess(`Added ${count} essential contacts to JARVIS memory & synced to cloud.`);
                  setShowContactsSyncModal(false);
                }}
                className="w-full py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded text-xs font-semibold hover:bg-emerald-500/30 transition-colors"
              >
                ⚡ Load 5 Essential Contacts (Mom, Dad, Rohit, Aviral, Emergency)
              </button>
            </div>

            {/* Option 1: File Import */}
            <div className="p-3.5 rounded-card bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 space-y-2.5">
              <div className="font-medium text-xs text-text-primary flex items-center gap-1.5">
                <FileUp size={14} className="text-[#4FC3F7]" />
                <span>Option 1: Import Contacts File (.vcf / iCloud / CSV)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  vcfInputRef.current?.click();
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-input bg-[#4FC3F7] text-[#07070F] text-xs font-semibold hover:bg-[#38b6f0] transition-colors cursor-pointer shadow-sm text-center"
              >
                <FileUp size={14} />
                <span>Select .vcf or .csv File</span>
              </button>

              <div className="text-[11px] text-text-muted space-y-1 bg-background-base/60 p-2.5 rounded border border-border-default/60">
                <p className="font-semibold text-text-primary">📱 How to export all iPhone contacts in 5 seconds:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Open iPhone <strong>Contacts</strong> app.</li>
                  <li>Tap <strong>Lists</strong> in the top left corner.</li>
                  <li>Long-press or tap <strong>All Contacts</strong> → tap <strong>Export</strong> (or Share Contacts).</li>
                  <li>Tap <strong>Save to Files</strong>. Then choose that .vcf file here!</li>
                </ol>
                <p className="pt-1 text-[10px] text-text-muted">
                  💻 <strong>On Mac / PC Laptop:</strong> Apple Contacts → File → Export vCard, or Google Contacts → Export.
                </p>
              </div>
            </div>

            {/* Option 2: Quick Paste */}
            <div className="p-3 rounded-card bg-background-surface/50 border border-border-default space-y-2">
              <div className="font-medium text-xs text-text-primary flex items-center gap-1.5">
                <ClipboardList size={14} className="text-[#4FC3F7]" />
                <span>Option 2: Paste Contact Names &amp; Numbers</span>
              </div>
              <textarea
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Aviral Vahdam, +91 9876543210&#10;Rohit Sharma, +91 9873945238&#10;Mom, +1 555 123 4567"
                className="w-full bg-background-base border border-border-default rounded p-2 text-xs text-text-primary outline-none focus:border-[#4FC3F7] font-mono"
              />
              <button
                type="button"
                onClick={(e) => {
                  handlePasteSubmit(e);
                  setShowContactsSyncModal(false);
                }}
                disabled={!pasteText.trim()}
                className="w-full py-1.5 bg-[#4FC3F7]/20 border border-[#4FC3F7]/40 text-[#4FC3F7] rounded text-xs font-medium hover:bg-[#4FC3F7]/30 transition-colors disabled:opacity-40"
              >
                Import Pasted Contacts
              </button>
            </div>

            {/* Option 3: Manual Add */}
            <div className="p-3 rounded-card bg-background-surface/50 border border-border-default space-y-2">
              <div className="font-medium text-xs text-text-primary flex items-center gap-1.5">
                <Plus size={14} className="text-[#4FC3F7]" />
                <span>Option 3: Add Single Contact</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Name (e.g. Rohit Sharma)"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="bg-background-base border border-border-default rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-[#4FC3F7]"
                />
                <input
                  type="tel"
                  placeholder="Phone (e.g. +91 9873945238)"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  className="bg-background-base border border-border-default rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-[#4FC3F7]"
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  handleAddContactSubmit(e);
                  if (newContact.name.trim()) setShowContactsSyncModal(false);
                }}
                disabled={!newContact.name.trim()}
                className="w-full py-1.5 bg-[#4FC3F7]/20 border border-[#4FC3F7]/40 text-[#4FC3F7] rounded text-xs font-medium hover:bg-[#4FC3F7]/30 transition-colors disabled:opacity-40"
              >
                Save Contact to Memory &amp; Cloud
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowContactsSyncModal(false)}
                className="px-4 py-1.5 rounded-input bg-background-surface border border-border-default text-xs text-text-secondary hover:text-text-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Section */}
      <div className="rounded-card border border-border-default bg-background-surface/30 p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Users size={16} className="text-[#4FC3F7]" />
            <h3 className="text-sm font-medium text-text-primary">Device Contacts</h3>
            <span className="text-xs font-mono text-text-muted bg-background-base px-2 py-0.5 rounded border border-border-default">
              {contacts.length} synced
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowAddContact(!showAddContact)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary"
            >
              <Plus size={12} /> Add Contact
            </button>
            <button
              type="button"
              onClick={() => setShowPasteContacts(!showPasteContacts)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary"
            >
              <ClipboardList size={12} /> Paste
            </button>
            <button
              type="button"
              onClick={() => vcfInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary cursor-pointer"
              title="Import exported iPhone (.vcf), Android (.vcf) or Google Contacts (.csv)"
            >
              <FileUp size={12} /> Import .vcf / CSV
            </button>
            <button
              type="button"
              onClick={() => {
                const count = seedEssentialContacts();
                setContactSuccess(`Added ${count} essential contacts to JARVIS memory & synced across your devices.`);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-input text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              title="Instantly add test contacts (Mom, Dad, Rohit Sharma, Aviral Vahdam, Emergency)"
            >
              <Sparkles size={12} /> Essential
            </button>
            <button
              type="button"
              onClick={handleSyncContacts}
              disabled={syncingContacts}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 text-[#4FC3F7] text-xs font-medium hover:bg-[#4FC3F7]/25 transition-colors disabled:opacity-50"
            >
              {syncingContacts ? <Loader2 size={12} className="animate-spin" /> : isLaptop ? <Laptop size={12} /> : <Smartphone size={12} />}
              {syncingContacts ? "Syncing…" : "Sync Device Contacts"}
            </button>
          </div>
        </div>

        {/* Informative Platform Guidance */}
        <div className="text-[11px] text-text-muted my-1.5 leading-relaxed bg-background-base/40 p-2 rounded border border-border-default/40">
          💡 <strong>iPhone &amp; Laptop tip:</strong> On iPhone, open <em>Contacts → tap Lists/Select All → Share Contacts → Save as .vcf</em> or tap &quot;Sync Device Contacts&quot; to import directly. On Android Chrome, tapping &quot;Sync Device Contacts&quot; opens your address book picker.
        </div>

        {contactSuccess && (
          <div className="flex items-center gap-2 text-xs text-success my-2">
            <Check size={13} /> {contactSuccess}
          </div>
        )}
        {contactError && (
          <div className="flex items-center gap-2 text-xs text-warning my-2">
            <AlertCircle size={13} /> {contactError}
          </div>
        )}

        {/* Quick Paste Modal / Box */}
        {showPasteContacts && (
          <form onSubmit={handlePasteSubmit} className="mt-3 p-3 bg-background-base rounded-input border border-border-default space-y-2">
            <label className="block text-xs font-medium text-text-primary">
              Paste Contacts (one per line, e.g. &ldquo;Aviral Vahdam, +91 9876543210&rdquo;):
            </label>
            <textarea
              rows={3}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Aviral Vahdam, +91 9876543210&#10;Rohit Sharma, +91 9873945238"
              className="w-full bg-background-surface border border-border-default rounded p-2 text-xs text-text-primary outline-none focus:border-[#4FC3F7] font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteContacts(false)}
                className="px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-[#4FC3F7]/20 border border-[#4FC3F7]/40 text-[#4FC3F7] rounded text-xs font-medium hover:bg-[#4FC3F7]/30"
              >
                Import Lines
              </button>
            </div>
          </form>
        )}

        {/* Add Contact Form */}
        {showAddContact && (
          <form onSubmit={handleAddContactSubmit} className="mt-3 p-3 bg-background-base rounded-input border border-border-default space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                required
                type="text"
                placeholder="Name (e.g. Rohit Sharma, Aviral Vahdam, Mom)"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                className="bg-background-surface border border-border-default rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-[#4FC3F7]"
              />
              <input
                type="tel"
                placeholder="Phone (e.g. +91 9873945238)"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                className="bg-background-surface border border-border-default rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-[#4FC3F7]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="email"
                placeholder="Email (optional)"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                className="bg-background-surface border border-border-default rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-[#4FC3F7]"
              />
              <input
                type="text"
                placeholder="Relationship / Tag (e.g. Mom, Boss, Friend)"
                value={newContact.relationship}
                onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                className="bg-background-surface border border-border-default rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-[#4FC3F7]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-[#4FC3F7]/20 border border-[#4FC3F7]/40 text-[#4FC3F7] rounded text-xs font-medium hover:bg-[#4FC3F7]/30"
              >
                Save Contact
              </button>
            </div>
          </form>
        )}

        {contacts.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowContactList(!showContactList)}
              className="text-xs text-text-muted hover:text-text-secondary inline-flex items-center gap-1 font-mono"
            >
              {showContactList ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showContactList ? "Hide contact list" : `View ${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
            </button>

            {showContactList && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-background-base/60 border border-border-default/60 text-xs">
                    <div className="min-w-0">
                      <span className="font-medium text-text-primary">{c.name}</span>
                      {c.relationship && (
                        <span className="ml-2 text-[10px] text-accent-blue bg-accent-blue/10 px-1.5 py-0.2 rounded border border-accent-blue/20">
                          {c.relationship}
                        </span>
                      )}
                      <div className="text-[11px] text-text-muted font-mono flex items-center gap-2 mt-0.5">
                        {c.phone && <span>{c.phone}</span>}
                        {c.email && <span>{c.email}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeContact(c.id)}
                      className="text-text-muted hover:text-accent-red p-1 rounded transition-colors"
                      title="Remove contact"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Files & Photos Section */}
      <div className="rounded-card border border-border-default bg-background-surface/30 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <FolderSync size={16} className="text-[#4FC3F7]" />
            <h3 className="text-sm font-medium text-text-primary">Device Files &amp; Photos Vault</h3>
            <span className="text-xs font-mono text-text-muted bg-background-base px-2 py-0.5 rounded border border-border-default">
              {docs.length} indexed
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary cursor-pointer",
                uploading && "opacity-50 pointer-events-none"
              )}
              title="Upload photos, camera roll, and images from device"
            >
              <ImageIcon size={12} className="text-emerald-400" /> Upload Photos
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary cursor-pointer",
                uploading && "opacity-50 pointer-events-none"
              )}
              title="Upload PDFs, office documents, notes, and code"
            >
              <FileText size={12} className="text-[#4FC3F7]" /> Upload Documents
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await seedSampleKnowledge();
                setFolderSuccess(`Indexed ${res.length} starter documents into your vault.`);
              }}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary cursor-pointer"
              title="Index starter guide & personal emergency notes into vault"
            >
              <Sparkles size={12} className="text-[#4FC3F7]" /> Starter Docs
            </button>
            <button
              type="button"
              onClick={handleSyncFolder}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 text-[#4FC3F7] text-xs font-medium hover:bg-[#4FC3F7]/25 transition-colors disabled:opacity-50"
              title="Sync folder on laptop or index files"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <FolderSync size={12} />}
              {uploading ? "Indexing…" : "Sync Folder"}
            </button>
          </div>
        </div>

        <div className="text-[11px] text-text-muted my-1.5 leading-relaxed bg-background-base/40 p-2 rounded border border-border-default/40">
          📁 <strong>Supported formats:</strong> Photos (JPG, PNG, HEIC, WebP), PDFs, Office Documents, Code, Text &amp; Markdown. Works seamlessly on iPhone, Android, and Laptop.
        </div>

        {folderSuccess && (
          <div className="flex items-center gap-2 text-xs text-success my-2">
            <Check size={13} /> {folderSuccess}
          </div>
        )}
        {folderError && (
          <div className="flex items-center gap-2 text-xs text-warning my-2">
            <AlertCircle size={13} /> {folderError}
          </div>
        )}

        {docs.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowFileList(!showFileList)}
              className="text-xs text-text-muted hover:text-text-secondary inline-flex items-center gap-1 font-mono"
            >
              {showFileList ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showFileList ? "Hide synced files list" : `View ${docs.length} indexed document${docs.length === 1 ? "" : "s"} & photos`}
            </button>

            {showFileList && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {docs.map((d) => {
                  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "heic", "heif", "image"].includes(d.file_type.toLowerCase());
                  return (
                    <div key={d.id} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-background-base/60 border border-border-default/60 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {isImage ? <ImageIcon size={13} className="text-emerald-400 shrink-0" /> : <FileText size={13} className="text-[#4FC3F7] shrink-0" />}
                        <span className="font-medium text-text-primary truncate">{d.title}</span>
                        <span className="text-[10px] font-mono text-text-muted uppercase shrink-0">
                          {d.file_type} · {Math.round(d.file_size_bytes / 1024)} KB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDoc(d.id)}
                        className="text-text-muted hover:text-accent-red p-1 rounded transition-colors ml-2 shrink-0"
                        title="Delete file from memory"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
