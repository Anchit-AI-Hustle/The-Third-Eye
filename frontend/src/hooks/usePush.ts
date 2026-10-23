"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getPolicy } from "@/lib/consent";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushState = "unsupported" | "off" | "on" | "blocked";

// Registers this device for web push once the user is signed in and has
// granted notifications, and offers enable() for a tap to ask (iOS only asks
// from a tap). "unsupported" when VAPID isn't set or the browser can't push.
export function usePush() {
  const { data: session } = useSession();
  const email = session?.user?.email;
  const [state, setState] = useState<PushState>("unsupported");

  const subscribe = useCallback(async () => {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    setState("on");
  }, []);

  useEffect(() => {
    if (!email || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    (async () => {
      try {
        if (Notification.permission === "denied") return setState("blocked");
        if (Notification.permission === "granted") return await subscribe();
        // The OS prompt is a one-shot, so it isn't spent on load unless the
        // user opted in for every time; otherwise the prompt offers a tap.
        if (getPolicy("notifications") !== "always") return setState("off");
        if ((await Notification.requestPermission()) === "granted") await subscribe();
        else setState("off");
      } catch {
        /* push is best-effort */
      }
    })();
  }, [email, subscribe]);

  const enable = useCallback(async () => {
    const p = await Notification.requestPermission();
    if (p === "granted") await subscribe().catch(() => setState("off"));
    else setState(p === "denied" ? "blocked" : "off");
  }, [subscribe]);

  return { state, enable };
}
