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
    <aside className={cn(
      "hidden lg:flex flex-col h-screen sticky top-0 bg-background-surface border-r border-border-default transition-all duration-200 ease-in-out flex-none",
      collapsed ? "w-16" : "w-60 xl:w-64 3xl:w-72"
    )}>
      {/* Brand */}
      <div className={cn(
        "flex items-center gap-3 border-b border-border-default h-16 flex-none",
        collapsed ? "justify-center px-0" : "px-5"
      )}>
        <div className="flex-none w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
          <span className="font-display font-bold text-accent-blue text-sm tracking-tight leading-none">AJ</span>
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold text-text-primary tracking-tight leading-none text-sm">
              JARVIS OS
            </div>
            <div className="text-[10px] font-mono text-text-muted mt-0.5 tracking-widest uppercase">
              Intelligence OS
            </div>
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
                "flex items-center gap-3 rounded-input text-sm transition-all duration-150",
                collapsed ? "justify-center px-2 py-3" : "px-3 py-2.5",
                isActive
                  ? "bg-accent-blue/10 text-accent-blue border border-accent-blue/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated border border-transparent"
              )}>
              <Icon size={15} className="flex-none" />
              {!collapsed && <span className="flex-1">{label}</span>}
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
          )}>
          <Settings size={15} className="flex-none" />
          {!collapsed && <span>Settings</span>}
        </Link>

        {session?.user && (
          <div className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-input",
            collapsed && "justify-center px-2"
          )}>
            {session.user.image ? (
              <img src={session.user.image} alt=""
                className="w-6 h-6 rounded-full flex-none object-cover ring-1 ring-border-hover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-accent-violet/20 border border-accent-violet/30 flex-none flex items-center justify-center text-xs text-accent-violet font-semibold">
                {session.user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            {!collapsed && (
              <>
                <span className="text-text-secondary text-xs truncate flex-1">
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
