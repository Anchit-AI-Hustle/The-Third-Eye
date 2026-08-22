"use client";

import { useEffect, useState } from "react";
import { onDeviceEvent, onHomeEvent, loadHub } from "@/lib/deviceControl";
import type { HubDevice } from "@/lib/homeHub";

export function DeviceHud() {
  const [last, setLast] = useState("Home Hub standing by");
  const [hub, setHub] = useState<HubDevice[]>(() => (typeof window === "undefined" ? [] : loadHub()));

  useEffect(() => {
    setHub(loadHub());
    const offD = onDeviceEvent(({ result }) => setLast(result.applied));
    const offH = onHomeEvent((devices) => {
      setHub(devices);
      const lights = devices.filter((d) => d.kind === "light" && d.on).length;
      const locked = devices.filter((d) => d.kind === "lock" && d.locked).length;
      setLast(`Hub · ${lights} lights on · ${locked} locked`);
    });
    return () => {
      offD();
      offH();
    };
  }, []);

  const lightsOn = hub.filter((d) => d.kind === "light" && d.on).length;
  const locked = hub.filter((d) => d.kind === "lock" && d.locked).length;

  return (
    <div
      className="pointer-events-none fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] left-3 lg:bottom-5 lg:left-5 z-40 max-w-[min(100%-2rem,280px)] rounded-md border border-[#1A3A5C] bg-[#07111F]/95 px-3 py-2 text-[11px] tracking-wide text-[#B0B8C8] shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
      aria-live="polite"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4FC3F7]">JARVIS · device</p>
      <p className="mt-1 leading-snug text-white">{last}</p>
      <p className="mt-1 font-mono text-[10px] text-[#6B7394]">
        {lightsOn} lights · {locked} locked
      </p>
    </div>
  );
}
