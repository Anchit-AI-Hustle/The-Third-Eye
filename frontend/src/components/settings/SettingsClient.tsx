"use client";

import { signOut } from "next-auth/react";
import { User, Shield, Bell, Cpu, LogOut, ExternalLink, Check, Mic, Brain, Bot } from "lucide-react";
import { AgentProfileManager } from "./AgentProfileManager";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
}

export function SettingsClient({ user }: Props) {
  const [notifs, setNotifs] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Agent Profiles */}
      <Section icon={<Bot size={15} />} title="AI Agent Profiles">
        <div className="p-5">
          <AgentProfileManager />
        </div>
      </Section>

      {/* Profile */}
      <Section icon={<User size={15} />} title="Operator Profile">
        <div className="flex items-center gap-4 p-5">
          {user?.image ? (
            <img src={user.image} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-[#4FC3F7]/20" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#4FC3F7]/10 border-2 border-[#4FC3F7]/30 flex items-center justify-center text-lg font-bold text-[#4FC3F7]">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div>
            <p className="text-text-primary font-medium">{user?.name ?? "Unknown"}</p>
            <p className="text-text-muted text-sm mt-0.5">{user?.email ?? ""}</p>
            <p className="text-text-muted text-xs mt-1 font-mono tracking-wider">GOOGLE OAUTH · VERIFIED</p>
          </div>
        </div>
      </Section>

      {/* AI preferences */}
      <Section icon={<Cpu size={15} />} title="AI Core Configuration">
        <div className="px-5 py-4 space-y-4">
          <Row label="Model" sub="Primary inference engine">
            <span className="text-xs font-mono text-[#4FC3F7] bg-[#4FC3F7]/10 px-2 py-1 rounded">
              gemini-2.5-flash
            </span>
          </Row>
          <Row label="Voice I/O" sub="Web Speech API · STT + TTS">
            <Toggle enabled={true} disabled />
          </Row>
          <Row label="Memory" sub="Session-scoped fact retention">
            <Toggle enabled={true} disabled />
          </Row>
          <Row label="Streaming" sub="Token-by-token response rendering">
            <Toggle enabled={true} disabled />
          </Row>
          <Row label="Knowledge RAG" sub="Document search with citations">
            <Toggle enabled={true} disabled />
          </Row>
        </div>
      </Section>

      {/* Preferences */}
      <Section icon={<Bell size={15} />} title="Preferences">
        <div className="px-5 py-4 space-y-4">
          <Row label="Notifications" sub="Browser notification prompts">
            <Toggle enabled={notifs} onChange={setNotifs} />
          </Row>
          <Row label="Sound effects" sub="UI interaction sounds">
            <Toggle enabled={false} disabled />
          </Row>
        </div>
        <div className="px-5 pb-4">
          <button
            onClick={handleSave}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-input text-sm font-medium transition-all font-mono",
              saved
                ? "bg-success/10 border border-success/30 text-success"
                : "bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 text-[#4FC3F7] hover:bg-[#4FC3F7]/20"
            )}
          >
            {saved ? <><Check size={14} /> Saved</> : "Save preferences"}
          </button>
        </div>
      </Section>

      {/* Security */}
      <Section icon={<Shield size={15} />} title="Security">
        <div className="px-5 py-4 space-y-3">
          <Row label="Authentication" sub="OAuth 2.0 via Google">
            <span className="text-xs text-success font-mono">Secure</span>
          </Row>
          <Row label="Session" sub="JWT · NextAuth managed">
            <span className="text-xs text-text-muted font-mono">24h TTL</span>
          </Row>
          <Row label="Data" sub="Session memory · localStorage fallback">
            <span className="text-xs text-text-muted font-mono">Client-side</span>
          </Row>
        </div>
      </Section>

      {/* About */}
      <Section icon={<ExternalLink size={15} />} title="System Info">
        <div className="px-5 py-4 space-y-2.5 text-sm text-text-muted font-mono">
          <InfoRow label="Version" value="0.1.0" />
          <InfoRow label="AI" value="Google Gemini 2.5 Flash" />
          <InfoRow label="Voice" value="Web Speech API (STT + TTS)" />
          <InfoRow label="Stack" value="Next.js 14 · Tailwind · Vercel" />
          <InfoRow label="Runtime" value="Node.js · Edge Functions" />
        </div>
      </Section>

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-card border border-border-default text-text-secondary hover:text-accent-red hover:border-accent-red/30 transition-colors text-sm font-mono"
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="holo-card rounded-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[rgba(79,195,247,0.08)]">
        <span className="text-[#4FC3F7]/50">{icon}</span>
        <h2 className="hud-label text-[#4FC3F7] text-[11px]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-secondary">{value}</span>
    </div>
  );
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => onChange?.(!enabled)}
      disabled={disabled}
      className={cn(
        "w-9 h-5 rounded-full relative transition-colors flex-none",
        enabled ? "bg-[#4FC3F7]" : "bg-background-elevated border border-border-default",
        disabled && "opacity-50 cursor-default"
      )}
    >
      <span className={cn(
        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
        enabled ? "translate-x-4" : "translate-x-0.5"
      )} />
    </button>
  );
}
