"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, ArrowUpRight, Volume2, ShieldAlert } from "lucide-react";
import { SYSTEMS } from "@/lib/systems";
import { triggerSystemsOnline } from "@/components/systems/SystemsOnline";
import { Persona3D } from "@/components/persona/Persona3D";
import { agentPersonas, OPERATOR_PERSONA } from "@/lib/persona/personas";
import { isAgentKilled, AGENT_EVENT } from "@/lib/agentControl";

// The "Online Agents" board — every agent & subsystem as a live widget with its
// status, purpose, and a redirect to the tool it powers. "Run status check"
// replays the spoken roll-call (each agent in its own voice).
//
// Status is gated on the real kill switch (lib/agentControl.ts): when it's
// engaged, every card and the header badge switch to "halted" rather than
// claiming "online" — voice roll-call is disabled too, since it would
// otherwise announce a live agent that has actually been stopped.
export function OnlineAgents() {
  const [running, setRunning] = useState(false);
  const [killed, setKilled] = useState(false);
  const agents = SYSTEMS.filter((s) => s.kind === "agent");
  const subsystems = SYSTEMS.filter((s) => s.kind === "subsystem");

  useEffect(() => {
    const sync = () => setKilled(isAgentKilled());
    sync();
    window.addEventListener(AGENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AGENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const runCheck = () => {
    if (killed) return;
    setRunning(true);
    triggerSystemsOnline({ all: true });
    setTimeout(() => setRunning(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {killed ? (
          <div className="flex items-center gap-2 text-[#EF4444]">
            <ShieldAlert size={16} />
            <span className="text-sm font-mono">Kill switch engaged — {SYSTEMS.length} systems halted</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[#34D399]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#34D399]" />
            </span>
            <span className="text-sm font-mono">{SYSTEMS.length} systems online</span>
          </div>
        )}
        <button onClick={runCheck} disabled={running || killed}
          title={killed ? "Kill switch is engaged — resume the agent on /activity to run a status check" : undefined}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-[#4FC3F7]/15 border border-[#4FC3F7]/40 text-[#4FC3F7] text-sm font-medium hover:bg-[#4FC3F7]/25 transition-colors disabled:opacity-50">
          <Volume2 size={15} /> {running ? "Running…" : "Run status check"}
        </button>
      </div>

      <PersonaStage killed={killed} />

      <Section title="AI Agents" items={agents} killed={killed} />
      <Section title="Subsystems" items={subsystems} killed={killed} />

      <p className="text-xs text-text-muted font-mono">
        Ask any time — say or type <span className="text-text-secondary">“all systems online”</span>, <span className="text-text-secondary">“agent status”</span>, or name one (<span className="text-text-secondary">“Zeus online”</span>) — and each reports in its own voice.
      </p>
    </div>
  );
}

// A 3D persona stage: one switchable canvas showing the selected persona (so
// every voice agent — and your own Operator persona — has a 3D face), with a
// picker and a "hear voice" preview that animates the persona while it speaks.
function PersonaStage({ killed }: { killed: boolean }) {
  const personas = agentPersonas();
  const [sel, setSel] = useState(personas[0]);
  const [speaking, setSpeaking] = useState(false);

  const canHear = sel.id === OPERATOR_PERSONA.id || !killed;

  const hear = () => {
    if (!canHear) return;
    setSpeaking(true);
    if (sel.id !== OPERATOR_PERSONA.id) triggerSystemsOnline({ names: [sel.id] });
    setTimeout(() => setSpeaking(false), 4000);
  };

  return (
    <section>
      <div className="hud-label text-text-muted mb-3">Personas</div>
      <div className="rounded-card border border-border-default bg-background-surface p-5 grid gap-5 sm:grid-cols-[240px_1fr] items-center">
        <div className="relative h-56 rounded-card overflow-hidden bg-background-base/60 flex items-center justify-center"
          style={{ boxShadow: `inset 0 0 80px ${sel.color}22` }}>
          <Persona3D color={sel.color} speaking={speaking} className="w-full h-full" />
          <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-mono uppercase tracking-widest" style={{ color: sel.color }}>{sel.name}</span>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-text-secondary min-h-[2.5rem]">{sel.purpose}</p>
          <button onClick={hear} disabled={speaking || !canHear}
            title={!canHear ? "Kill switch is engaged — resume the agent on /activity to hear this persona" : undefined}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-input text-sm font-medium border transition-colors disabled:opacity-50"
            style={{ color: sel.color, borderColor: `${sel.color}55` }}>
            <Volume2 size={14} /> {speaking ? "Speaking…" : !canHear ? "Halted" : sel.id === OPERATOR_PERSONA.id ? "Preview persona" : `Hear ${sel.name.replace(/\./g, "")}`}
          </button>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {personas.map((p) => (
              <button key={p.id} onClick={() => setSel(p)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors"
                style={p.id === sel.id
                  ? { color: "#07070F", background: p.color, borderColor: p.color }
                  : { color: p.color, borderColor: `${p.color}44` }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.id === sel.id ? "#07070F" : p.color }} />
                {p.name.replace(/\./g, "")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Section({ title, items, killed }: { title: string; items: typeof SYSTEMS; killed: boolean }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="hud-label text-text-muted mb-3">{title}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <div key={s.id} className="group relative rounded-card border border-border-default bg-background-surface p-4 overflow-hidden hover:border-[color:var(--c)]/50 transition-colors"
            style={{ ["--c" as string]: s.accentColor }}>
            <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: killed ? "#EF4444" : s.accentColor }} />
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-none" style={{ background: `${s.accentColor}1A`, color: s.accentColor }}>
                  <Radio size={16} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{s.name}</div>
                  {killed ? (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-[#EF4444]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" /> halted
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-[#34D399]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" style={{ boxShadow: "0 0 6px #34D399" }} /> online
                    </div>
                  )}
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
