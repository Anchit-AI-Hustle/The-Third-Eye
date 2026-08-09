"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ConsentDialog } from "@/components/layout/ConsentDialog";
import { CaptureProvider } from "@/components/capture/CaptureContext";
import { PermissionProvider } from "@/components/permission/PermissionProvider";
import { IngestBridge } from "@/components/tasks/IngestBridge";
import { DeviceLogBridge } from "@/components/tasks/DeviceLogBridge";
import { SystemsOnline } from "@/components/systems/SystemsOnline";
import { CommandPalette } from "@/components/command/CommandPalette";
import { getPolicy, getCurrentLocation } from "@/lib/consent";

function LocationBridge() {
  // When location consent is granted (either by an earlier session or just
  // now via the dialog), fetch coordinates once and stash them on window so
  // chat / tool calls can include them in their request bodies. Refresh
  // every 10 minutes so a long session reflects movement.
  useEffect(() => {
    let stop = false;
    async function tick() {
      if (stop) return;
      // Background location polling only runs under a standing "every time"
      // grant; "ask each time" must not silently read location in the background.
      if (getPolicy("location") === "always") {
        const loc = await getCurrentLocation();
        if (loc && typeof window !== "undefined") {
          (window as any).__teLocation = loc;
        }
      }
    }
    tick();
    const t = setInterval(tick, 10 * 60_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <PermissionProvider>
          <CaptureProvider>
            {children}
            <ConsentDialog />
            <LocationBridge />
            <IngestBridge />
            <DeviceLogBridge />
            <SystemsOnline />
            <CommandPalette />
          </CaptureProvider>
        </PermissionProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
