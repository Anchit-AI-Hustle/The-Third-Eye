"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { inInstalledApp } from "@/lib/installedApp";

// The installed app opens at the site root; the marketing page is for the
// website, so the app goes straight to its welcome and sign-in.
export function AppStartRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (inInstalledApp()) router.replace("/auth/signin");
  }, [router]);
  return null;
}
