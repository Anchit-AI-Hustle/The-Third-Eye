"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  CAPABILITIES, PermissionCapability, PermissionPolicy,
  allPolicies, setPolicy, PERM_POLICY_EVENT,
} from "@/lib/consent";
import { CAP_META } from "@/components/permission/PermissionProvider";

// Lets the user review and change how The Third Eye remembers each device
// permission: "Every time" (never re-ask) or "Ask each time". Revoking a
// standing grant just drops it back to "Ask", so the next use prompts again.
export function PermissionsCard() {
  const [policies, setPolicies] = useState<Record<PermissionCapability, PermissionPolicy> | null>(null);

  useEffect(() => {
    setPolicies(allPolicies());
    const onChange = () => setPolicies(allPolicies());
    window.addEventListener(PERM_POLICY_EVENT, onChange);
    return () => window.removeEventListener(PERM_POLICY_EVENT, onChange);
  }, []);

  if (!policies) return null;

  return (
    <div className="mt-6 rounded-card border border-border-default bg-background-surface/40 p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={16} className="text-[#4FC3F7]" />
        <h2 className="font-semibold text-text-primary">Device permissions</h2>
      </div>
      <p className="text-xs text-text-muted mb-4 leading-relaxed">
        The Third Eye only uses a device capability when you ask — and always with your permission.
        Your device shows its own prompt; this controls whether the app remembers your choice or
        asks again each time.
      </p>

      <div className="divide-y divide-border-default">
        {CAPABILITIES.map((cap) => {
          const meta = CAP_META[cap];
          const Icon = meta.icon;
          const policy = policies[cap];
          return (
            <div key={cap} className="flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-lg bg-background-elevated border border-border-default flex items-center justify-center flex-none">
                <Icon size={16} className="text-[#4FC3F7]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text-primary">{meta.label}</div>
                <div className="text-[11px] text-text-muted truncate">{meta.reason}</div>
              </div>
              <div className="flex rounded-input border border-border-default overflow-hidden flex-none text-xs">
                {(["always", "ask"] as PermissionPolicy[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPolicy(cap, p)}
                    className={
                      policy === p
                        ? "px-3 py-1.5 bg-[#4FC3F7] text-[#07070F] font-medium"
                        : "px-3 py-1.5 text-text-muted hover:text-text-primary"
                    }
                  >
                    {p === "always" ? "Every time" : "Ask each time"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
