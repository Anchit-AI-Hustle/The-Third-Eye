"use client";

import { useState, useRef } from "react";
import { Users, FolderSync, Plus, Trash2, Smartphone, FileText, Image as ImageIcon, Check, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useLocalContacts, type DeviceContact } from "@/hooks/useLocalContacts";
import { useLocalKnowledge } from "@/hooks/useLocalKnowledge";
import { cn } from "@/lib/utils";

export function DeviceSyncCard() {
  const { contacts, syncing: syncingContacts, syncDeviceContacts, addContact, removeContact } = useLocalContacts();
  const { docs, uploading, upload, remove: removeDoc, syncDeviceFolder } = useLocalKnowledge();

  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderSuccess, setFolderSuccess] = useState<string | null>(null);

  const [showAddContact, setShowAddContact] = useState(false);
  const [showContactList, setShowContactList] = useState(false);
  const [showFileList, setShowFileList] = useState(false);

  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
    relationship: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSyncContacts = async () => {
    setContactError(null);
    setContactSuccess(null);
    const res = await syncDeviceContacts();
    if (res.error) {
      setContactError(res.error);
    } else {
      setContactSuccess(`Successfully synced ${res.count} contact${res.count === 1 ? "" : "s"} from your device.`);
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
    setContactSuccess("Contact added to JARVIS memory.");
  };

  const handleSyncFolder = async () => {
    setFolderError(null);
    setFolderSuccess(null);
    const res = await syncDeviceFolder();
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
  };

  return (
    <div className="holo-card rounded-card p-5 mt-5">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone size={14} className="text-[#4FC3F7]" />
        <span className="hud-label text-[#4FC3F7]">// Device Connectors &amp; Local Hub</span>
      </div>
      <h2 className="font-display text-lg font-semibold text-text-primary">Device Data &amp; Media Sync</h2>
      <p className="text-text-muted text-xs font-mono mt-1 mb-5 tracking-wider">
        Allow JARVIS to access device contacts, files, and photos natively and locally. Contacts resolve names (&ldquo;Mom&rdquo;, &ldquo;Rohit&rdquo;) to numbers for WhatsApp/Calls/SMS, and local files/photos are indexed into the assistant&apos;s knowledge vault.
      </p>

      {/* Contacts Section */}
      <div className="rounded-card border border-border-default bg-background-surface/30 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#4FC3F7]" />
            <h3 className="text-sm font-medium text-text-primary">Device Contacts</h3>
            <span className="text-xs font-mono text-text-muted bg-background-base px-2 py-0.5 rounded border border-border-default">
              {contacts.length} synced
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddContact(!showAddContact)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary"
            >
              <Plus size={12} /> Add Contact
            </button>
            <button
              type="button"
              onClick={handleSyncContacts}
              disabled={syncingContacts}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 text-[#4FC3F7] text-xs font-medium hover:bg-[#4FC3F7]/25 transition-colors disabled:opacity-50"
            >
              {syncingContacts ? <Loader2 size={12} className="animate-spin" /> : <Smartphone size={12} />}
              {syncingContacts ? "Syncing…" : "Sync Device Contacts"}
            </button>
          </div>
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

        {showAddContact && (
          <form onSubmit={handleAddContactSubmit} className="mt-3 p-3 bg-background-base rounded-input border border-border-default space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                required
                type="text"
                placeholder="Name (e.g. Rohit Sharma or Mom)"
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
                        <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] bg-accent-blue/10 text-accent-blue font-mono">
                          {c.relationship}
                        </span>
                      )}
                      <div className="text-text-muted text-[11px] font-mono mt-0.5">
                        {[c.phone, c.email].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeContact(c.id)}
                      className="p-1 text-text-muted hover:text-accent-red transition-colors"
                      aria-label="Remove contact"
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
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <FolderSync size={16} className="text-[#4FC3F7]" />
            <h3 className="text-sm font-medium text-text-primary">Device Files &amp; Photos Vault</h3>
            <span className="text-xs font-mono text-text-muted bg-background-base px-2 py-0.5 rounded border border-border-default">
              {docs.length} indexed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              multiple
              accept="image/*,.txt,.md,.json,.csv,.py,.ts,.js,.html,.sh"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-input text-xs font-medium border border-border-default hover:bg-background-elevated transition-colors text-text-secondary disabled:opacity-50"
            >
              <ImageIcon size={12} /> Upload Files / Photos
            </button>
            <button
              type="button"
              onClick={handleSyncFolder}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 text-[#4FC3F7] text-xs font-medium hover:bg-[#4FC3F7]/25 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <FolderSync size={12} />}
              {uploading ? "Indexing…" : "Sync Folder"}
            </button>
          </div>
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
                  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "image"].includes(d.file_type.toLowerCase());
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
                        className="p-1 text-text-muted hover:text-accent-red transition-colors shrink-0"
                        aria-label="Remove indexed document"
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
