"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, Trash2 } from "lucide-react";
import { deleteGeneration, featureHistory, timeAgo, type GenerationRecord } from "@/lib/generations";

const PAGE = 10;

// This feature's own history: everything it has made on this device, newest
// first, each opening its full record. The same records also feed /generations.
export function FeatureHistory({ tool, accent }: { tool: string; accent: string }) {
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    const refresh = () => setItems(featureHistory(tool));
    refresh();
    window.addEventListener("te:generations-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("te:generations-updated", refresh); window.removeEventListener("storage", refresh); };
  }, [tool]);

  return (
    <section className="mt-6 rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} style={{ color: accent }} />
        <span className="hud-label" style={{ color: accent }}>History</span>
        <span className="text-[11px] font-mono text-text-muted">{items.length}</span>
      </div>
      {!items.length && <p className="text-xs text-text-muted">Nothing made here yet — everything this feature produces is listed here.</p>}
      <ul className="divide-y divide-border-default">
        {items.slice(0, visible).map((g) => (
          <li key={g.id} className="flex items-center gap-3 py-2">
            <Link href={`/generations/${g.id}`} className="min-w-0 flex-1 group">
              <div className="text-sm text-text-primary truncate group-hover:underline">{g.title}</div>
              <div className="text-[10px] font-mono text-text-muted">{timeAgo(g.createdAt)} · {g.kind}</div>
            </Link>
            <button type="button" onClick={() => deleteGeneration(g.id)} aria-label={`Delete ${g.title}`}
              className="p-1 text-text-muted hover:text-accent-red transition-colors">
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      {visible < items.length && (
        <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="mt-2 text-[11px] text-text-muted hover:text-text-primary">
          Show {Math.min(PAGE, items.length - visible)} more of {items.length - visible}
        </button>
      )}
    </section>
  );
}
