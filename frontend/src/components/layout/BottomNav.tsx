"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, CheckSquare, FileText, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home",   href: "/dashboard", icon: LayoutDashboard },
  { label: "JARVIS", href: "/assistant", icon: MessageSquare },
  { label: "Tasks",  href: "/tasks",     icon: CheckSquare },
  { label: "Notes",  href: "/notes",     icon: FileText },
  { label: "Goals",  href: "/goals",     icon: Target },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-background-surface/95 backdrop-blur-modal border-t border-border-default safe-bottom">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
              isActive ? "text-[#4FC3F7]" : "text-text-muted"
            )}>
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              <span className={cn(
                "text-[10px] font-medium leading-none",
                isActive ? "text-accent-blue" : "text-text-muted"
              )}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
