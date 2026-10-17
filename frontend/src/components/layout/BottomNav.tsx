"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, CheckSquare, FileText, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Today",     href: "/dashboard", icon: LayoutDashboard },
  { label: "Assistant", href: "/assistant", icon: MessageSquare },
  { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
  { label: "Notes",     href: "/notes",     icon: FileText },
];

const TAB = "flex-1 flex flex-col items-center justify-center gap-1.5 transition-colors min-h-[48px]";

// Everything else, Settings included, is one tap away under More (the full menu).
export function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-background-surface/95 backdrop-blur-modal border-t border-border-default safe-bottom">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-label={label} aria-current={isActive ? "page" : undefined} className={cn(
              TAB,
              isActive ? "text-[#4FC3F7]" : "text-text-muted"
            )}>
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} aria-hidden="true" />
              <span className={cn(
                "text-[11px] font-medium leading-none",
                isActive ? "text-accent-blue" : "text-text-muted"
              )}>{label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={onMore} aria-label="More" className={cn(TAB, "text-text-muted")}>
          <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
          <span className="text-[11px] font-medium leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}
