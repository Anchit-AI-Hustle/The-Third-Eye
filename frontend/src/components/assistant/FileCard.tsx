"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, ExternalLink } from "lucide-react";
import { deliverFile, safeFilename, type SavedFile } from "@/lib/fileSave";
import { ensureCapability } from "@/lib/permissionGate";

export function FileCard({ file, auto = false }: { file: SavedFile; auto?: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const tried = useRef(false);

  function run(open: boolean) {
    const r = deliverFile(file, { open });
    setStatus(!open ? "Saved to Downloads." : r.opened ? "Saved to Downloads and opened in a new tab." : "Saved to Downloads. Allow pop-ups for this site to open it automatically.");
  }

  useEffect(() => {
    if (!auto || tried.current) return;
    tried.current = true;
    void ensureCapability("files").then((ok) => { if (ok) run(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const name = safeFilename(file.filename, file.mime);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-input border border-border-default bg-background-base px-3 py-2">
      <FileDown size={14} className="text-accent-blue flex-none" />
      <span className="text-xs text-text-primary font-mono truncate max-w-[200px]">{name}</span>
      <span className="text-[11px] text-text-muted">{Math.max(1, Math.round(file.content.length / 1024))} KB</span>
      <span className="flex-1" />
      <button type="button" onClick={() => run(true)}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-input bg-accent-blue/15 border border-accent-blue/30 text-accent-blue">
        <ExternalLink size={11} /> Save & open
      </button>
      <button type="button" onClick={() => run(false)} className="text-xs px-2 py-1 rounded-input border border-border-default text-text-secondary">
        Download
      </button>
      {status && <p className="basis-full text-[11px] text-text-muted">{status}</p>}
    </div>
  );
}
