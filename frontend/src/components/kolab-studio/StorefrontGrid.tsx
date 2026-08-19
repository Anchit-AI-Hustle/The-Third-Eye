"use client";
import { useState } from "react";
import type { Deal } from "@/lib/kolab-studio/studio";

export function StorefrontGrid({ deals }: { deals: Deal[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(code);
        setTimeout(() => setCopied(null), 1500);
      },
      () => {},
    );
  }

  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-kolab-line bg-kolab-surface p-6 text-center text-[14px] text-kolab-muted">
        No live deals yet — add some in Creator Studio → Brand Deals.
      </div>
    );
  }

  return (
    <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
      {deals.map((x) => (
        <div key={x.id} className="flex flex-col overflow-hidden rounded-xl border border-kolab-line bg-kolab-surface">
          <div className="relative grid h-20 place-items-center bg-gradient-to-br from-kolab-surface2 to-kolab-base text-[34px]">
            {x.emoji || "🏷️"}
            {x.discount && (
              <span className="absolute right-2 top-2 rounded bg-kolab-lime px-1.5 py-0.5 font-mono text-[9px] font-bold text-kolab-base">
                {x.discount}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-3.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-kolab-muted">
              {x.brand}
              {x.category ? " · " + x.category : ""}
            </span>
            <span className="text-[14px] font-semibold">{x.product}</span>
            {x.price && <span className="font-kolab-display text-[15px] font-black">{x.price}</span>}
            {x.code && (
              <div className="flex items-center gap-1.5">
                <code className="rounded border border-dashed border-kolab-line bg-kolab-surface2 px-1.5 py-1 font-mono text-[11px] text-kolab-lime">{x.code}</code>
                <button className="rounded-[9px] border border-kolab-line bg-kolab-surface px-2 py-1.5 font-mono text-[10px] font-bold uppercase" onClick={() => copy(x.code!)}>
                  {copied === x.code ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            <a
              className="mt-1.5 inline-flex items-center justify-center rounded-[9px] border border-kolab-lime bg-kolab-lime px-2 py-2 font-mono text-[11px] font-bold uppercase text-kolab-base"
              href={x.affiliate_url || "#"}
              target="_blank"
              rel="noopener nofollow"
            >
              Shop ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
