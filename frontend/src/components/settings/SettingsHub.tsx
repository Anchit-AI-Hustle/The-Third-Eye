"use client";

import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Bot, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { AutomationsCard } from "@/components/settings/AutomationsCard";
import { PermissionsCard } from "@/components/settings/PermissionsCard";
import { AgentProfileManager } from "@/components/settings/AgentProfileManager";
import { ActivationSettings } from "@/components/settings/ActivationSettings";
import { ProvidersCard } from "@/components/settings/ProvidersCard";
import { WhatsAppCard } from "@/components/settings/WhatsAppCard";
import { DeviceSyncCard } from "@/components/settings/DeviceSyncCard";

interface Props {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
}

export function SettingsHub({ user }: Props) {
  const [tab, setTab] = useState<"device" | "account" | "agent">("device");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("tab");
      if (q === "device" || q === "account" || q === "agent") {
        setTab(q);
      }
    }
  }, []);

  return (
    <>
      <div className="flex gap-1 mb-6 p-0.5 rounded-input border border-border-default bg-background-surface w-fit flex-wrap">
        {([
          { id: "device" as const, label: "Device & App Settings", icon: Smartphone },
          { id: "account" as const, label: "Account & Connections", icon: SettingsIcon },
          { id: "agent" as const, label: "Agent Config", icon: Bot },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.set("tab", id);
                window.history.replaceState({}, "", url.toString());
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-input text-xs sm:text-sm font-medium transition-colors",
              tab === id ? "bg-[#4FC3F7]/15 text-[#4FC3F7] border border-[#4FC3F7]/30" : "text-text-muted hover:text-text-primary"
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "device" ? (
        <div className="space-y-6">
          <PermissionsCard />
          <DeviceSyncCard />
        </div>
      ) : tab === "account" ? (
        <div className="space-y-6">
          <SettingsClient user={user} />
          <ConnectionsCard />
          <WhatsAppCard />
          <AutomationsCard />
        </div>
      ) : (
        <div className="space-y-8">
          <ProvidersCard />
          <AgentProfileManager />
          <ActivationSettings />
        </div>
      )}
    </>
  );
}
