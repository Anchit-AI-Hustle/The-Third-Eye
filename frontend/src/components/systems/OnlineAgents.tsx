"use client";

import { useState } from "react";
import Link from "next/link";
import { Radio, ArrowUpRight, Volume2 } from "lucide-react";
import { SYSTEMS } from "@/lib/systems";
import { triggerSystemsOnline } from "@/components/systems/SystemsOnline";

// The "Online Agents" board — every agent & subsystem as a live widget with its
// status, purpose, and a redirect to the tool it powers. "Run status check"
// replays the spoken roll-call (each agent in its own voice).
export function OnlineAgents() {
  const [running, setRunning] = useState(false);
  const agents = SYSTEMS.filter((s) => s.kind === "agent");
  const subsystems = SYSTEMS.filter((s) => s.kind === "subsystem");

  const runCheck = () => {
    setRunning(true);
    triggerSystemsOnline({ all: true });
    setTimeout(() => setRunning(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[#34D399]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#34D399]" />
          </span>
          <span className="text-sm font-mono">{SYSTEMS.length} systems online</span>
        </div>
        <button onClick={runCheck} disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/40 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/25 transition-colors disabled:opacity-50">
          <Volume2 size={15} /> Run status check
        </button>
      </div>

      <Section title="AI Agents" items={agents} />
      <Section title="Subsystems" items={subsystems} />

      <p className="text-xs text-text-muted font-mono">
        Ask any time — say or type <span className="text-text-secondary">“all systems online”</span>, <span className="text-text-secondary">“agent status”</span>, or name one (<span className="text-text-secondary">“Zeus online”</span>) — and each reports in its own voice.
      </p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: typeof SYSTEMS }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="hud-label text-text-muted mb-3">{title}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <div key={s.id} className="group relative rounded-card border border-border-default bg-background-surface p-4 overflow-hidden hover:border-[color:var(--c)]/50 transition-colors"
            style={{ ["--c" as string]: s.accentColor }}>
            <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: s.accentColor }} />
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-none" style={{ background: `${s.accentColor}1A`, color: s.accentColor }}>
                  <Radio size={16} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{s.name}</div>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-[#34D399]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" style={{ boxShadow: "0 0 6px #34D399" }} /> online
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-text-secondary mt-3 leading-relaxed min-h-[2.5rem]">{s.purpose}</p>
            <Link href={s.href}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono transition-colors"
              style={{ color: s.accentColor }}>
              Open {s.name.replace(/\./g, "")} <ArrowUpRight size={12} />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
