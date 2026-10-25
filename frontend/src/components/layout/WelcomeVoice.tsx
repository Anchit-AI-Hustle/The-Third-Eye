"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Volume2, X } from "lucide-react";
import { useTTS } from "@/hooks/useVoice";
import { useAgentProfile } from "@/hooks/useAgentProfile";

const KEY = "te_welcomed_v1:";
// Browsers refuse speech until the person has tapped the page, and a sign-in
// redirect doesn't count. If it hasn't started by then, it waits for a tap.
const START_WAIT_MS = 1500;

export function welcomeLine(name: string | null | undefined, agent: string): string {
  const first = name?.trim().split(/\s+/)[0];
  return `Welcome to The Third Eye${first ? `, ${first}` : ""}. I'm ${agent}, your assistant. Ask me anything, any time.`;
}

/** The assistant greets each account aloud the first time it signs in on this device. */
export function WelcomeVoice() {
  const { data: session, status } = useSession();
  const email = session?.user?.email;
  const { active } = useAgentProfile();
  const { speak, stop, speaking, supported } = useTTS(active.voicePreference);
  const [blocked, setBlocked] = useState(false);
  const pending = useRef<string | null>(null);
  const say = useRef(speak);
  say.current = speak;
  const name = session?.user?.name;

  useEffect(() => {
    if (status !== "authenticated" || !email || !supported || localStorage.getItem(KEY + email) === "1") return;
    const line = welcomeLine(name, active.name);
    pending.current = line;
    void say.current(line, undefined, true);
    const wait = setTimeout(() => { if (pending.current) setBlocked(true); }, START_WAIT_MS);
    const onTap = (e: Event) => {
      if (pending.current && !(e.target as Element | null)?.closest?.("[data-welcome-skip]")) void say.current(pending.current, undefined, true);
    };
    window.addEventListener("pointerdown", onTap);
    window.addEventListener("keydown", onTap);
    return () => {
      clearTimeout(wait);
      window.removeEventListener("pointerdown", onTap);
      window.removeEventListener("keydown", onTap);
    };
  }, [status, email, supported, name, active.name]);

  useEffect(() => {
    if (!speaking || !email || !pending.current) return;
    localStorage.setItem(KEY + email, "1");
    pending.current = null;
    setBlocked(false);
  }, [speaking, email]);

  if (!blocked || !pending.current || !email) return null;
  return (
    <div role="status" className="fixed z-50 left-1/2 -translate-x-1/2 top-[calc(4rem_+_env(safe-area-inset-top))] lg:top-6 max-w-[calc(100vw-2rem)] whitespace-nowrap flex items-center gap-2 rounded-full border border-[#4FC3F7]/40 bg-background-surface/95 px-2 py-1.5 shadow-lg">
      {/* The window-wide tap listener plays it; this is the obvious place to tap. */}
      <button type="button"
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-[#4FC3F7] hover:bg-[#4FC3F7]/10">
        <Volume2 size={16} /> Hear your welcome from {active.name}
      </button>
      <button type="button" data-welcome-skip aria-label="Skip the welcome" onClick={() => { localStorage.setItem(KEY + email, "1"); pending.current = null; stop(); setBlocked(false); }}
        className="p-1.5 rounded-full text-text-muted hover:text-text-primary">
        <X size={14} />
      </button>
    </div>
  );
}
