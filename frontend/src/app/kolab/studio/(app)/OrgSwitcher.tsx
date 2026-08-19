"use client";
// web/app/(app)/OrgSwitcher.tsx — switch the active org, and create a new workspace of any type
// (spec §2: "you can create more later" — type is a property of the org, not the user).
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PACK_META, type PackType } from "@/lib/kolab-studio/packs";

export interface OrgOption {
  id: string;
  name: string;
  type: PackType;
}

export function OrgSwitcher({ orgs, activeId }: { orgs: OrgOption[]; activeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];

  async function pick(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    await fetch("/api/kolab-studio/org/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: id }),
    });
    setOpen(false);
    setBusy(false);
    router.push("/kolab/studio/home");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full border border-kolab-line bg-kolab-surface px-3 py-1.5 font-kolab-mono text-[11px] hover:border-kolab-lime"
      >
        <span>{PACK_META[active.type].icon}</span>
        <span className="max-w-[120px] truncate">{active.name}</span>
        <span className="text-kolab-faint">▾</span>
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-[240px] rounded-xl border border-kolab-line bg-kolab-surface2 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <div className="px-2.5 py-1 font-kolab-mono text-[9px] uppercase tracking-[0.1em] text-kolab-faint">Workspaces</div>
            {orgs.map((o) => (
              <button
                key={o.id}
                onClick={() => pick(o.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-kolab-surface ${
                  o.id === activeId ? "text-kolab-lime" : "text-kolab-ink"
                }`}
              >
                <span>{PACK_META[o.type].icon}</span>
                <span className="flex-1 truncate">{o.name}</span>
                <span className="font-kolab-mono text-[9px] uppercase text-kolab-faint">{PACK_META[o.type].label.split(" ")[0]}</span>
              </button>
            ))}
            <div className="my-1 border-t border-kolab-line" />
            <Link
              href="/kolab/studio/onboarding?add=1"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-kolab-muted hover:bg-kolab-surface hover:text-kolab-ink"
            >
              <span className="text-[14px]">＋</span>
              <span>New workspace…</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
