"use client";
// web/app/(app)/setup/ChannelsManager.tsx — link social channels by handle (persisted to the
// channels table via /api/kolab-studio/channels). Real OAuth connect is Phase 3; this is the
// manual link.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/kolab-studio/ui";
import { CHANNELS } from "@/lib/kolab-studio/content";
import type { Platform } from "@/lib/kolab-studio/types";

export function ChannelsManager({
  initial,
}: {
  initial: { platform: Platform; handle: string }[];
}) {
  const router = useRouter();
  const initialMap = Object.fromEntries(initial.map((c) => [c.platform, c.handle])) as Record<Platform, string>;
  const [handles, setHandles] = useState<Record<string, string>>(initialMap);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(platform: Platform) {
    setBusy(platform);
    setMsg(null);
    try {
      const res = await fetch("/api/kolab-studio/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle: handles[platform] ?? "" }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Could not link");
      setMsg(`${platform} saved`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not link");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {CHANNELS.map((c) => (
          <Card key={c.k} className="flex items-center gap-3 p-3.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-[9px] font-kolab-display text-[13px] font-black text-white" style={{ background: c.c }}>
              {c.ini}
            </span>
            <div className="flex-1">
              <div className="mb-1 text-[13px] font-semibold">{c.n}</div>
              <Input
                value={handles[c.k] ?? ""}
                placeholder="@handle"
                onChange={(e) => setHandles((h) => ({ ...h, [c.k]: e.target.value }))}
              />
            </div>
            <Button disabled={busy === c.k} onClick={() => save(c.k as Platform)}>
              {initialMap[c.k as Platform] ? "Update" : "Link"}
            </Button>
          </Card>
        ))}
      </div>
      {msg && <p className="mt-3 font-kolab-mono text-[12px] text-kolab-muted">{msg}</p>}
    </div>
  );
}
