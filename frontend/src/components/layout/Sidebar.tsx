"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  BookOpen,
  Workflow,
  BarChart2,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Assistant", href: "/assistant", icon: MessageSquare },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Automation", href: "/automation", icon: Workflow, phase: 4 },
  { label: "Finance", href: "/finance", icon: BarChart2, phase: 3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-56 flex-none bg-background-surface border-r border-border-default flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border-default">
        <span className="font-display font-semibold text-text-primary tracking-tight">
          JARVIS OS
        </span>
        <span className="ml-2 text-xs font-mono text-text-muted">v0.1</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon, phase }) => {
          const isActive = pathname.startsWith(href);
          const isDisabled = phase !== undefined && phase > 1;

          return (
            <Link
              key={href}
              href={isDisabled ? "#" : href}
              aria-disabled={isDisabled}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-input text-sm transition-colors duration-150",
                isActive
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated",
                isDisabled && "opacity-30 cursor-not-allowed pointer-events-none"
              )}
            >
              <Icon size={15} className="flex-none" />
              <span>{label}</span>
              {phase && phase > 1 && (
                <span className="ml-auto text-xs font-mono text-text-muted">
                  Ph{phase}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: User + Settings */}
      <div className="px-3 py-4 border-t border-border-default space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-input text-sm text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors duration-150"
        >
          <Settings size={15} />
          <span>Settings</span>
        </Link>

        {session?.user && (
          <div className="flex items-center gap-3 px-3 py-2">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name ?? ""}
                className="w-6 h-6 rounded-full flex-none"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-accent-violet flex-none flex items-center justify-center text-xs text-white font-medium">
                {session.user.name?.[0] ?? "U"}
              </div>
            )}
            <span className="text-text-secondary text-sm truncate flex-1">
              {session.user.name ?? session.user.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
