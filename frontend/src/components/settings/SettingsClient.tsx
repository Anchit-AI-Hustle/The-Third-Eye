"use client";

import { signOut } from "next-auth/react";
import { User, Shield, Bell, Cpu, LogOut, ExternalLink, Check } from "lucide-react";
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
      {/* Profile */}
      <Section icon={<User size={15} />} title="Profile">
        <div className="flex items-center gap-4 p-5">
          {user?.image ? (
            <img src={user.image} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-border-default" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-accent-violet/20 border-2 border-accent-violet/30 flex items-center justify-center text-lg font-bold text-accent-violet">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div>
            <p className="text-text-primary font-medium">{user?.name ?? "Unknown"}</p>
            <p className="text-text-muted text-sm mt-0.5">{user?.email ?? ""}</p>
            <p className="text-text-muted text-xs mt-1 font-mono">Signed in with Google</p>
          </div>
        </div>
      </Section>

      {/* AI preferences */}
      <Section icon={<Cpu size={15} />} title="AI Configuration">
        <div className="px-5 py-4 space-y-4">
          <Row label="Model" sub="Primary inference engine">
            <span className="text-xs font-mono text-accent-blue bg-accent-blue/10 px-2 py-1 rounded">
              claude-sonnet-4-6
            </span>
          </Row>
          <Row label="Prompt caching" sub="Reduces cost by caching system prompt">
            <Toggle enabled={true} disabled />
          </Row>
          <Row label="Memory" sub="JARVIS remembers facts within a session">
            <Toggle enabled={true} disabled />
          </Row>
          <Row label="Streaming" sub="Token-by-token response rendering">
            <Toggle enabled={true} disabled />
          </Row>
        </div>
      </Section>

      {/* Notifications */}
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
              "flex items-center gap-2 px-4 py-2 rounded-input text-sm font-medium transition-all",
              saved
                ? "bg-success/10 border border-success/30 text-success"
                : "bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20"
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
          <Row label="Session duration" sub="JWT token lifetime">
            <span className="text-xs text-text-muted font-mono">24 hours</span>
          </Row>
          <Row label="Data storage" sub="Conversations are not persisted server-side">
            <span className="text-xs text-text-muted font-mono">Local only</span>
          </Row>
        </div>
      </Section>

      {/* About */}
      <Section icon={<ExternalLink size={15} />} title="About">
        <div className="px-5 py-4 space-y-2 text-sm text-text-muted font-mono">
          <div className="flex items-center justify-between">
            <span>Version</span><span className="text-text-secondary">0.1.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Stack</span><span className="text-text-secondary">Next.js 14 · Tailwind · Anthropic</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Runtime</span><span className="text-text-secondary">Node.js · Vercel Edge</span>
          </div>
        </div>
      </Section>

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-card border border-border-default text-text-secondary hover:text-accent-red hover:border-accent-red/30 transition-colors text-sm"
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-background-surface border border-border-default rounded-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-default">
        <span className="text-text-muted">{icon}</span>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
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

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => onChange?.(!enabled)}
      disabled={disabled}
      className={cn(
        "w-9 h-5 rounded-full relative transition-colors flex-none",
        enabled ? "bg-accent-blue" : "bg-background-elevated border border-border-default",
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
