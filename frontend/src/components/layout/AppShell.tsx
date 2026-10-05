"use client";

import { usePathname } from "next/navigation";
import { mainClassFor, showsAppShell } from "@/lib/appShell";
import { MainLayout } from "./MainLayout";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  if (!showsAppShell(pathname)) return <>{children}</>;
  return <MainLayout mainClassName={mainClassFor(pathname)}>{children}</MainLayout>;
}
