"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ACTIVATION_EVENT,
  loadActivation,
  saveActivation,
  type ActivationConfig,
} from "@/lib/activation";

export function useActivationConfig() {
  const [config, setConfig] = useState<ActivationConfig>(loadActivation);

  useEffect(() => {
    const sync = () => setConfig(loadActivation());
    window.addEventListener(ACTIVATION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTIVATION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback(<K extends keyof ActivationConfig>(key: K, value: ActivationConfig[K]) => {
    const next = { ...loadActivation(), [key]: value };
    saveActivation(next);
    setConfig(next);
  }, []);

  return { config, update };
}
