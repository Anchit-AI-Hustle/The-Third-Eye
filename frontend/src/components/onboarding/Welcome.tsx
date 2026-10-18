"use client";

import { useState } from "react";
import { LogoMark } from "@/components/layout/LogoMark";
import { SceneBackdrop } from "@/components/hud/SceneBackdrop";
import { Reveal } from "@/components/hud/Reveal";
import { HoloFrame } from "@/components/hud/HoloFrame";

export const WELCOME_SEEN = "te_welcome_seen";

const SCREENS = [
  {
    tag: "Personal AI OS",
    title: "Your assistant,",
    accent: "always on call",
    body: "Talk or type. It knows your tasks, notes, contacts, photos and files, so answers are about your life, not the internet's.",
  },
  {
    tag: "Agents online",
    title: "It acts,",
    accent: "not just answers",
    body: "It sets reminders, writes notes, plans your day and briefs you every morning. Ask once, and it gets done.",
  },
  {
    tag: "Private workspace",
    title: "Private",
    accent: "by design",
    body: "Your data stays in your account and you can delete it any time. It asks before anything that sends, pays or deletes.",
  },
];

const READOUT = [
  { k: "assistant", v: "online" },
  { k: "workspace", v: "private" },
  { k: "agents", v: "6 ready" },
];

// Shown once, on the first visit to sign-in, in the app or on the website.
export function Welcome({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const finish = () => {
    try { localStorage.setItem(WELCOME_SEEN, "1"); } catch { /* private mode: it shows again next time */ }
    onDone();
  };
  const { tag, title, accent, body } = SCREENS[i];
  const last = i === SCREENS.length - 1;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background-base flex flex-col px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <SceneBackdrop />
      <div className="relative z-10 flex items-center justify-between">
        <span className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.2em] text-text-primary">
          <LogoMark size={28} />
          <span>THE <span className="text-accent-violet">THIRD</span> EYE</span>
        </span>
        {!last && <button type="button" onClick={finish} className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted hover:text-text-secondary">Skip</button>}
      </div>
      <Reveal key={i} immediate stagger={0.1} className="relative z-10 flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
        <div data-reveal className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-accent-blue">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-blue" />
          {tag}
        </div>
        <h1 data-reveal className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-text-primary">
          {title} <span className="gradient-text">{accent}</span>
        </h1>
        <p data-reveal className="mt-5 text-[15px] leading-relaxed text-text-secondary">{body}</p>
        <HoloFrame data-reveal rule size="sm" className="mt-10 w-full max-w-xs rounded-card border border-border-default/60 bg-background-surface/40 px-5 py-3 backdrop-blur-sm">
          <dl className="flex items-center justify-between gap-4">
            {READOUT.map((r) => (
              <div key={r.k} className="text-left">
                <dt className="hud-label">{r.k}</dt>
                <dd className="font-mono text-xs text-text-secondary">{r.v}</dd>
              </div>
            ))}
          </dl>
        </HoloFrame>
      </Reveal>
      <div className="relative z-10 max-w-sm w-full mx-auto">
        <div className="mb-6 flex justify-center gap-2" aria-hidden="true">
          {SCREENS.map((s, n) => (
            <span key={s.tag} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-accent-blue shadow-[0_0_10px_rgba(79,195,247,0.8)]" : "w-1.5 bg-white/20"}`} />
          ))}
        </div>
        <button type="button" onClick={() => (last ? finish() : setI(i + 1))}
          className="w-full h-12 rounded-input bg-accent-blue text-background-base text-sm font-semibold shadow-[0_0_30px_rgba(79,195,247,0.35)] hover:brightness-110 active:scale-[0.98] transition-all">
          {last ? "Get started" : "Next"}
        </button>
      </div>
    </div>
  );
}
