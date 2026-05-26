"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ConsentKey,
  ConsentState,
  getConsent,
  requestConsent,
  requestConsentBundle,
  hasBeenAsked,
  resetConsents,
  getCurrentLocation,
} from "@/lib/consent";

export function useConsent(key: ConsentKey) {
  const [state, setState] = useState<ConsentState>("prompt");

  useEffect(() => {
    setState(getConsent(key));
  }, [key]);

  const request = useCallback(async () => {
    const next = await requestConsent(key);
    setState(next);
    return next;
  }, [key]);

  return { state, request, granted: state === "granted", denied: state === "denied" };
}

export function useAllConsents() {
  const mic = useConsent("microphone");
  const cam = useConsent("camera");
  const loc = useConsent("location");
  const notif = useConsent("notifications");

  return { mic, cam, loc, notif };
}

export function useConsentBundle() {
  const [bundleAsked, setBundleAsked] = useState(false);

  useEffect(() => {
    setBundleAsked(hasBeenAsked());
  }, []);

  const requestAll = useCallback(async (keys: ConsentKey[]) => {
    const result = await requestConsentBundle(keys);
    setBundleAsked(true);
    return result;
  }, []);

  const reset = useCallback(() => {
    resetConsents();
    setBundleAsked(false);
  }, []);

  return { bundleAsked, requestAll, reset };
}

export { getCurrentLocation };
