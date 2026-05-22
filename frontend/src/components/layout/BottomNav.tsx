"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  BookOpen,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home",      href: "/dashboard",  icon: LayoutDashboard },
  { label: "Assistant", href: "/assistant",  icon: MessageSquare },
  { label: "Tasks",     href: "/tasks",      icon: CheckSquare },
  { label: "Knowledge", href: "/knowledge",  icon: BookOpen },
  { label: "Finance",   href: "/finance",    icon: BarChart2, disabled: true },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-background-surface/95 backdrop-blur-md border-t border-border-default safe-bottom">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ label, href, icon: Icon, disabled }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={disabled ? "#" : href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                isActive ? "text-accent-blue" : "text-text-muted",
                disabled && "opacity-30 pointer-events-none"
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
