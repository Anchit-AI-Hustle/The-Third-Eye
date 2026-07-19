"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Check, X } from "lucide-react";
import { announceSystems, resolveSystems, type SystemDef, type SystemsTarget } from "@/lib/systems";
import { logAgentAction } from "@/lib/agentControl";

// Global "All Systems Online" HUD. Listens for the `te:systems-online` window
// event (dispatched by the assistant, the ambient mic, or the manual button) and
// runs a status sequence — each system reports in its own voice while its row
// lights up green.

type Phase = "pending" | "speaking" | "online";

export function SystemsOnline() {
  const [open, setOpen] = useState(false);
  const [systems, setSystems] = useState<SystemDef[]>([]);
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const running = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (target: SystemsTarget) => {
    const list = resolveSystems(target);
    if (!list.length || running.current) return;
    running.current = true;
    if (closeTimer.current) clearTimeout(closeTimer.current);

    setSystems(list);
    setPhases(Object.fromEntries(list.map((s) => [s.id, "pending" as Phase])));
    setOpen(true);

    await announceSystems(list, (id, phase) => {
      setPhases((p) => ({ ...p, [id]: phase }));
    });

    try { logAgentAction({ type: "systems.status", label: list.length === 1 ? `${list[0].name} reported online` : `All systems online (${list.length})`, outcome: "applied" }); } catch { /* noop */ }
    running.current = false;
    closeTimer.current = setTimeout(() => setOpen(false), 2600);
  }, []);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<SystemsTarget>).detail ?? ({ all: true } as SystemsTarget);
      void run(detail);
    };
    window.addEventListener("te:systems-online", onEvent as EventListener);
    return () => window.removeEventListener("te:systems-online", onEvent as EventListener);
  }, [run]);

  if (!open) return null;

  const total = systems.length;
  const done = systems.filter((s) => phases[s.id] === "online").length;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      onClick={() => !running.current && setOpen(false)}>
      <div className="relative w-full max-w-md rounded-2xl border border-[#4FC3F7]/30 bg-[#070B12] shadow-[0_0_60px_rgba(79,195,247,0.25)]"
        onClick={(e) => e.stopPropagation()}>
        {!running.current && (
          <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-text-muted hover:text-text-primary" aria-label="Close">
            <X size={16} />
          </button>
        )}
        <div className="p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <Radio size={16} className="text-[#4FC3F7] animate-pulse" />
            <span className="hud-label text-[#4FC3F7]">// Systems status</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-text-primary mb-4">
            {total === 1 ? systems[0].name : "All Systems"} — {done}/{total} online
          </h2>

          <div className="space-y-2">
            {systems.map((s) => {
              const ph = phases[s.id] ?? "pending";
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-input border border-border-default bg-background-surface/40 px-3 py-2.5">
                  <span className="relative flex-none w-2.5 h-2.5">
                    <span className="absolute inset-0 rounded-full" style={{
                      background: ph === "online" ? "#34D399" : ph === "speaking" ? s.accentColor : "#3A3A4A",
                      boxShadow: ph === "online" ? "0 0 8px #34D399" : ph === "speaking" ? `0 0 8px ${s.accentColor}` : "none",
                    }} />
                    {ph === "speaking" && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: s.accentColor }} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                      {s.name}
                      {ph === "online" && <Check size={13} className="text-[#34D399]" />}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted truncate">
                      {ph === "pending" ? "standby…" : ph === "speaking" ? s.line : "online"}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-wider flex-none"
                    style={{ color: ph === "online" ? "#34D399" : ph === "speaking" ? s.accentColor : "#6B7690" }}>
                    {ph === "online" ? "online" : ph === "speaking" ? "reporting" : "…"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fire the status sequence from anywhere. */
export function triggerSystemsOnline(target: SystemsTarget = { all: true }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("te:systems-online", { detail: target }));
}
