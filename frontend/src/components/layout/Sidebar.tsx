"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, MessageSquare, CheckSquare, BookOpen,
  BarChart2, Settings, LogOut, PanelLeftClose, PanelLeftOpen,
  FileText, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Assistant",  href: "/assistant",  icon: MessageSquare },
  { label: "Tasks",      href: "/tasks",      icon: CheckSquare },
  { label: "Notes",      href: "/notes",      icon: FileText },
  { label: "Goals",      href: "/goals",      icon: Target },
  { label: "Knowledge",  href: "/knowledge",  icon: BookOpen },
  { label: "Finance",    href: "/finance",    icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-screen sticky top-0 bg-background-surface border-r border-border-default transition-all duration-200 ease-in-out flex-none",
        collapsed ? "w-16" : "w-60 xl:w-64 3xl:w-72"
      )}
    >
      {/* Logo — Arc Reactor */}
      <div className={cn(
        "flex items-center gap-3 border-b border-border-default h-16 flex-none",
        collapsed ? "justify-center px-0" : "px-5"
      )}>
        <div className="arc-reactor flex-none" style={{ width: 32, height: 32 }}>
          <div className="arc-reactor-core" style={{ width: 8, height: 8 }} />
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold text-text-primary tracking-tight leading-none gradient-text-arc">
              JARVIS OS
            </div>
            <div className="text-[10px] font-mono text-text-muted mt-0.5 tracking-wider">v0.1.0 · ONLINE</div>
          </div>
        )}

        {!collapsed && (
          <button onClick={() => setCollapsed(true)}
            className="text-text-muted hover:text-text-primary transition-colors p-1 rounded"
            title="Collapse">
            <PanelLeftClose size={14} />
          </button>
        )}
      </div>

      {collapsed && (
        <button onClick={() => setCollapsed(false)}
          className="mx-auto mt-3 p-1.5 text-text-muted hover:text-text-primary hover:bg-background-elevated rounded transition-colors"
          title="Expand">
          <PanelLeftOpen size={14} />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link key={href} href={href} title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-input text-sm transition-all duration-150 relative",
                collapsed ? "justify-center px-2 py-3" : "px-3 py-2.5",
                isActive
                  ? "bg-[#4FC3F7]/8 text-[#4FC3F7]"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#4FC3F7] rounded-r shadow-[0_0_8px_rgba(79,195,247,0.5)]" />
              )}
              <Icon size={16} className="flex-none" />
              {!collapsed && <span className="flex-1 font-mono text-xs tracking-wide">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border-default px-2 py-3 space-y-0.5 flex-none">
        <Link href="/settings" title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-input text-sm text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-all border border-transparent",
            collapsed ? "justify-center px-2 py-3" : "px-3 py-2.5"
          )}
        >
          <Settings size={16} className="flex-none" />
          {!collapsed && <span className="font-mono text-xs tracking-wide">Settings</span>}
        </Link>

        {session?.user && (
          <div className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-input",
            collapsed && "justify-center px-2"
          )}>
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name ?? ""}
                className="w-6 h-6 rounded-full flex-none object-cover ring-1 ring-[#4FC3F7]/20"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 flex-none flex items-center justify-center text-xs text-[#4FC3F7] font-semibold">
                {session.user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            {!collapsed && (
              <>
                <span className="text-text-secondary text-xs truncate flex-1 font-mono">
                  {session.user.name?.split(" ")[0] ?? session.user.email}
                </span>
                <button onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                  className="text-text-muted hover:text-accent-red transition-colors p-0.5"
                  title="Sign out">
                  <LogOut size={13} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
