"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Sync = { remote: boolean; reason: string } | null;

// A small, honest indicator of where the user's data actually lives. Without
// this, a missing DATABASE_URL silently drops the whole app into
// localStorage-only mode — data looks saved but never syncs across devices.
export function CloudSyncBadge({ collapsed, narrowOpen = false }: { collapsed?: boolean; narrowOpen?: boolean }) {
  const [sync, setSync] = useState<Sync>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/api/sync-status")
        .then((r) => r.json())
        .then((d) => { if (alive) { setSync(d); setLoading(false); } })
        .catch(() => { if (alive) { setSync({ remote: false, reason: "offline" }); setLoading(false); } });
    check();
    const onTasks = () => check();
    window.addEventListener("te:tasks-updated", onTasks);
    return () => { alive = false; window.removeEventListener("te:tasks-updated", onTasks); };
  }, []);

  const remote = sync?.remote ?? false;
  const label = loading ? "Checking sync…" : remote ? "Cloud synced" : "Local only";
  const tip = remote
    ? "Your data syncs to the cloud database and is available across devices."
    : sync?.reason === "unconfigured"
      ? "Cloud storage isn't configured (service key missing) — data is saved only in this browser."
      : sync?.reason === "signed-out"
        ? "Sign in to sync your data to the cloud."
        : "Data is saved only in this browser right now.";

  const Icon = loading ? Loader2 : remote ? Cloud : CloudOff;
  const color = loading ? "text-text-muted" : remote ? "text-[#34D399]" : "text-[#F0C94E]";

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono",
        !narrowOpen && "max-lg:justify-center max-lg:px-1",
        collapsed && "lg:justify-center lg:px-1",
      )}
      title={`${label} — ${tip}`}
    >
      <Icon size={14} className={cn(color, "flex-none", loading && "animate-spin")} />
      <span className={cn(color, !narrowOpen && "max-lg:hidden", collapsed && "lg:hidden")}>{label}</span>
    </div>
  );
}
