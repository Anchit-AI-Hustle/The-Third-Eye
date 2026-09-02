"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, Check, X } from "lucide-react";
import { announceSystems, resolveSystems, type SystemDef, type SystemsTarget } from "@/lib/systems";
import { isAgentKilled, logAgentAction } from "@/lib/agentControl";

// Global "All Systems Online" HUD. Listens for the `te:systems-online` window
// event (dispatched by the assistant, the ambient mic, or the manual button) and
// runs a status sequence — each system reports in its own voice while its row
// lights up green.
//
// Gated on the real kill switch: when it's engaged, no system is actually
// running, so this skips the spoken "online, nominal" roll-call entirely and
// shows every row as halted instead of announcing a status that isn't true.

type Phase = "pending" | "speaking" | "online" | "halted";

export function SystemsOnline() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [systems, setSystems] = useState<SystemDef[]>([]);
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [lines, setLines] = useState<Record<string, string>>({});
  const running = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (target: SystemsTarget) => {
    const list = resolveSystems(target);
    if (!list.length || running.current) return;
    running.current = true;
    if (closeTimer.current) clearTimeout(closeTimer.current);

    // Activate the Online Agents tab so the persistent status board is in view.
    try { router.push("/agents"); } catch { /* noop */ }

    setSystems(list);
    setLines({});
    setOpen(true);

    if (isAgentKilled()) {
      setPhases(Object.fromEntries(list.map((s) => [s.id, "halted" as Phase])));
      try { logAgentAction({ type: "systems.status", label: "Status check blocked — kill switch engaged", outcome: "blocked" }); } catch { /* noop */ }
      running.current = false;
      closeTimer.current = setTimeout(() => setOpen(false), 2600);
      return;
    }

    setPhases(Object.fromEntries(list.map((s) => [s.id, "pending" as Phase])));

    await announceSystems(list, (id, phase, line) => {
      setPhases((p) => ({ ...p, [id]: phase }));
      if (line) setLines((l) => ({ ...l, [id]: line }));
    });

    try { logAgentAction({ type: "systems.status", label: list.length === 1 ? `${list[0].name} reported online` : `All systems online (${list.length})`, outcome: "applied" }); } catch { /* noop */ }
    running.current = false;
    closeTimer.current = setTimeout(() => setOpen(false), 2600);
  }, [router]);

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
  const halted = systems.some((s) => phases[s.id] === "halted");
  const done = systems.filter((s) => phases[s.id] === "online").length;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      onClick={() => !running.current && setOpen(false)}>
      <div className={`relative w-full max-w-md rounded-2xl border bg-[#070B12] ${halted ? "border-[#EF4444]/30 shadow-[0_0_60px_rgba(239,68,68,0.2)]" : "border-[#4FC3F7]/30 shadow-[0_0_60px_rgba(79,195,247,0.25)]"}`}
        onClick={(e) => e.stopPropagation()}>
        {!running.current && (
          <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-text-muted hover:text-text-primary" aria-label="Close">
            <X size={16} />
          </button>
        )}
        <div className="p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <Radio size={16} className={halted ? "text-[#EF4444]" : "text-[#4FC3F7] animate-pulse"} />
            <span className={`hud-label ${halted ? "text-[#EF4444]" : "text-[#4FC3F7]"}`}>// Systems status</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-text-primary mb-4">
            {halted
              ? "Kill switch engaged"
              : `${total === 1 ? systems[0].name : "All Systems"} — ${done}/${total} online`}
          </h2>

          <div className="space-y-2">
            {systems.map((s) => {
              const ph = phases[s.id] ?? "pending";
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-input border border-border-default bg-background-surface/40 px-3 py-2.5">
                  <span className="relative flex-none w-2.5 h-2.5">
                    <span className="absolute inset-0 rounded-full" style={{
                      background: ph === "online" ? "#34D399" : ph === "halted" ? "#EF4444" : ph === "speaking" ? s.accentColor : "#3A3A4A",
                      boxShadow: ph === "online" ? "0 0 8px #34D399" : ph === "halted" ? "0 0 8px #EF4444" : ph === "speaking" ? `0 0 8px ${s.accentColor}` : "none",
                    }} />
                    {ph === "speaking" && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: s.accentColor }} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                      {s.name}
                      {ph === "online" && <Check size={13} className="text-[#34D399]" />}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted truncate">
                      {ph === "pending" ? "standby…" : ph === "halted" ? "kill switch engaged" : ph === "speaking" ? (lines[s.id] ?? "reporting…") : "online"}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-wider flex-none"
                    style={{ color: ph === "online" ? "#34D399" : ph === "halted" ? "#EF4444" : ph === "speaking" ? s.accentColor : "#6B7690" }}>
                    {ph === "online" ? "online" : ph === "halted" ? "halted" : ph === "speaking" ? "reporting" : "…"}
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
