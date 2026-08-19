"use client";
// web/app/(app)/AppMenu.tsx — the sticky, highlighted primary menu bar. Pack-aware: the nav
// items come from lib/packs (PACK_NAV[orgType]). Items still in build are dimmed and inert.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/kolab-studio/packs";

export function AppMenu({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="sticky top-[53px] z-30 border-b-2 border-kolab-lime bg-gradient-to-b from-kolab-surface to-kolab-surface2 shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
      <div className="mx-auto flex max-w-[1120px] items-center gap-2 px-[clamp(16px,4vw,30px)]">
        <span className="self-start rounded-br-lg bg-kolab-lime px-2.5 py-[5px] font-kolab-mono text-[9px] font-bold uppercase tracking-[0.14em] text-kolab-base">
          Menu
        </span>
        <div className="flex flex-1 gap-1 overflow-x-auto py-2.5 [scrollbar-width:none]">
          {nav.map((t, i) => {
            const isReady = t.ready !== false;
            const href = `/kolab/studio${t.href}`;
            const on = isReady && (pathname === href || pathname.startsWith(href + "/"));
            const cls = `flex flex-none items-center gap-2 whitespace-nowrap rounded-[9px] border px-[15px] py-2.5 font-kolab-mono text-[12px] font-bold ${
              on
                ? "border-transparent bg-kolab-lime text-kolab-base shadow-[0_2px_10px_rgba(194,240,74,0.3)]"
                : "border-transparent text-kolab-muted hover:border-kolab-line hover:text-kolab-ink"
            }`;
            if (!isReady) {
              return (
                <span key={`${t.label}-${i}`} className={`${cls} cursor-default opacity-45`} title="In build">
                  <span className="text-[14px]">{t.icon}</span>
                  {t.label}
                </span>
              );
            }
            return (
              <Link key={`${t.label}-${i}`} href={href} className={cls}>
                <span className="text-[14px]">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
