"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, ExternalLink } from "lucide-react";
import { deliverFile, safeFilename, type SavedFile } from "@/lib/fileSave";
import { ensureCapability } from "@/lib/permissionGate";

function deliveredText(open: boolean, opened: boolean): string {
  if (!open) return "Saved to Downloads.";
  return opened ? "Saved to Downloads and opened in a new tab." : "Saved to Downloads. Allow pop-ups for this site to open it automatically.";
}

export const NOT_ALLOWED = "Not saved yet. Tap Save & open, or allow \"Save & open files\" in Settings.";

// Saves and opens a file once the user has allowed it; returns what happened.
export async function saveWithConsent(file: SavedFile): Promise<string> {
  if (!(await ensureCapability("files"))) return NOT_ALLOWED;
  return deliveredText(true, deliverFile(file, { open: true }).opened);
}

// claimAuto returns true only the first time it is asked, so a file saves on
// its own when the reply arrives and never again when the chat is reopened.
export function FileCard({ file, claimAuto }: { file: SavedFile; claimAuto?: () => boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const tried = useRef(false);

  function run(open: boolean) {
    setStatus(deliveredText(open, deliverFile(file, { open }).opened));
  }

  useEffect(() => {
    if (tried.current || !file.content || !claimAuto?.()) return;
    tried.current = true;
    void saveWithConsent(file).then(setStatus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = safeFilename(file.filename, file.mime);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-input border border-border-default bg-background-base px-3 py-2">
      <FileDown size={14} className="text-accent-blue flex-none" />
      <span className="text-xs text-text-primary font-mono truncate max-w-[200px]">{name}</span>
      {!file.content ? (
        <span className="text-[11px] text-text-muted">Too big to keep in chat history; ask JARVIS to make it again.</span>
      ) : (<>
      <span className="text-[11px] text-text-muted">{Math.max(1, Math.round(file.content.length / 1024))} KB</span>
      <span className="flex-1" />
      <button type="button" onClick={() => run(true)}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-input bg-accent-blue/15 border border-accent-blue/30 text-accent-blue">
        <ExternalLink size={11} /> Save & open
      </button>
      <button type="button" onClick={() => run(false)} className="text-xs px-2 py-1 rounded-input border border-border-default text-text-secondary">
        Download
      </button>
      </>)}
      {status && <p className="basis-full text-[11px] text-text-muted">{status}</p>}
    </div>
  );
}
