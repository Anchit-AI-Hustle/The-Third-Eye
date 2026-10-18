"use client";

import { useState } from "react";
import { Brain, Zap, ShieldCheck } from "lucide-react";

export const WELCOME_SEEN = "te_welcome_seen";

const SCREENS = [
  {
    icon: Brain,
    title: "Your assistant, always on call",
    body: "Talk or type. It knows your tasks, notes, contacts, photos and files, so answers are about your life, not the internet's.",
  },
  {
    icon: Zap,
    title: "It acts, not just answers",
    body: "It sets reminders, writes notes, plans your day and briefs you every morning. Ask once, and it gets done.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Your data stays in your account and you can delete it any time. It asks before anything that sends, pays or deletes.",
  },
];

// Shown once, the first time the installed app opens, before sign-in.
export function Welcome({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const finish = () => {
    try { localStorage.setItem(WELCOME_SEEN, "1"); } catch { /* private mode: it shows again next time */ }
    onDone();
  };
  const { icon: Icon, title, body } = SCREENS[i];
  const last = i === SCREENS.length - 1;

  return (
    <div className="min-h-screen bg-background-base flex flex-col px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex justify-end">
        {!last && <button type="button" onClick={finish} className="text-sm text-text-muted hover:text-text-secondary">Skip</button>}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        <span className="mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-accent-blue/30 bg-accent-blue/10 text-accent-blue shadow-[0_0_40px_rgba(79,195,247,0.15)]">
          <Icon size={34} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">{body}</p>
      </div>
      <div className="max-w-sm w-full mx-auto">
        <div className="mb-6 flex justify-center gap-2" aria-hidden="true">
          {SCREENS.map((s, n) => (
            <span key={s.title} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-accent-blue" : "w-1.5 bg-white/20"}`} />
          ))}
        </div>
        <button type="button" onClick={() => (last ? finish() : setI(i + 1))}
          className="w-full h-12 rounded-input bg-accent-blue text-background-base text-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all">
          {last ? "Get started" : "Next"}
        </button>
      </div>
    </div>
  );
}
