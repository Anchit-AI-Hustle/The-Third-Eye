"use client";

import { useCallback, useEffect, useState } from "react";
import { getPolicy, PERM_POLICY_EVENT } from "@/lib/consent";

/**
 * Whether passive wake-word listening may use the microphone: the app's
 * "Allow every time", a grant made earlier this session, or the browser already
 * holding a standing grant for this site. Requiring the first alone left the
 * wake word silently off for anyone who had answered "Allow once".
 */
export function useMicReady() {
  const [always, setAlways] = useState(false);
  const [browserGranted, setBrowserGranted] = useState(false);
  const [sessionGranted, setSessionGranted] = useState(false);

  useEffect(() => {
    const read = () => setAlways(getPolicy("microphone") === "always");
    read();
    window.addEventListener(PERM_POLICY_EVENT, read);
    return () => window.removeEventListener(PERM_POLICY_EVENT, read);
  }, []);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => setBrowserGranted(status?.state === "granted");
    navigator.permissions?.query({ name: "microphone" as PermissionName })
      .then((s) => { status = s; update(); s.addEventListener("change", update); })
      .catch(() => { /* Safari before 16 has no microphone permission query */ });
    return () => status?.removeEventListener("change", update);
  }, []);

  const markGranted = useCallback(() => setSessionGranted(true), []);
  return { ready: always || browserGranted || sessionGranted, markGranted };
}
