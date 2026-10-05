"use client";

import { useState } from "react";
import { Settings as SettingsIcon, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { AutomationsCard } from "@/components/settings/AutomationsCard";
import { PermissionsCard } from "@/components/settings/PermissionsCard";
import { AgentProfileManager } from "@/components/settings/AgentProfileManager";
import { ActivationSettings } from "@/components/settings/ActivationSettings";

interface Props {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
}

export function SettingsHub({ user }: Props) {
  const [tab, setTab] = useState<"account" | "agent">("account");

  return (
    <>
      <div className="flex gap-1 mb-6 p-0.5 rounded-input border border-border-default bg-background-surface w-fit">
        {([
          { id: "account" as const, label: "Account", icon: SettingsIcon },
          { id: "agent" as const, label: "Agent config", icon: Bot },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-input text-sm font-medium transition-colors",
              tab === id ? "bg-accent-blue/15 text-accent-blue" : "text-text-muted hover:text-text-primary"
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "account" ? (
        <>
          <SettingsClient user={user} />
          <ConnectionsCard />
          <AutomationsCard />
          <PermissionsCard />
        </>
      ) : (
        <div className="space-y-8">
          <AgentProfileManager />
          <ActivationSettings />
        </div>
      )}
    </>
  );
}
