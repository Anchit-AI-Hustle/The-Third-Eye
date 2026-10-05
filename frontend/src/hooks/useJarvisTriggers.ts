"use client";

import { useEffect, useRef } from "react";
import {
  ACTIVATION_EVENT,
  hapticIfEnabled,
  loadActivation,
  matchesHotkey,
  type ActivationConfig,
} from "@/lib/activation";

const FIRE_COOLDOWN_MS = 1500;
const SHAKE_GAP_MS = 150;
const SHAKE_SPEED = 800;

function typingInField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return t.isContentEditable;
}

export function useJarvisTriggers(onActivate: () => void) {
  const onActivateRef = useRef(onActivate);
  useEffect(() => { onActivateRef.current = onActivate; }, [onActivate]);

  useEffect(() => {
    let cfg = loadActivation();
    const sync = () => { cfg = loadActivation(); };
    window.addEventListener(ACTIVATION_EVENT, sync);
    window.addEventListener("storage", sync);

    let lastFire = 0;
    const fire = (withHaptic: boolean) => {
      const now = Date.now();
      if (now - lastFire < FIRE_COOLDOWN_MS) return;
      lastFire = now;
      if (withHaptic) hapticIfEnabled(cfg);
      onActivateRef.current();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || typingInField(e.target)) return;
      if (!matchesHotkey(e, cfg.hotkey)) return;
      e.preventDefault();
      fire(false);
    };

    let lastX = 0, lastY = 0, lastZ = 0, lastMotion = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      if (!cfg.gestureEnabled || cfg.selectedGesture !== "shake") return;
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const now = Date.now();
      if (now - lastMotion < SHAKE_GAP_MS) return;
      const dt = Math.max(now - lastMotion, 1);
      lastMotion = now;
      const speed = Math.abs(acc.x + acc.y + acc.z - lastX - lastY - lastZ) / dt * 10000;
      lastX = acc.x; lastY = acc.y; lastZ = acc.z;
      if (speed > SHAKE_SPEED) fire(true);
    };

    const onTouch = (e: TouchEvent) => {
      if (!cfg.gestureEnabled || cfg.selectedGesture !== "double_tap") return;
      if (e.touches.length !== 2) return;
      if (typingInField(e.target)) return;
      fire(true);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("touchstart", onTouch, { passive: true });

    return () => {
      window.removeEventListener(ACTIVATION_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("touchstart", onTouch);
    };
  }, []);
}

type MotionRequest = { requestPermission?: () => Promise<string> };

export async function requestShakePermission(): Promise<boolean> {
  const Ctor = window.DeviceMotionEvent as unknown as MotionRequest | undefined;
  if (typeof Ctor?.requestPermission !== "function") return true;
  try {
    return (await Ctor.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function maybeRequestShake(cfg: ActivationConfig): void {
  if (!cfg.gestureEnabled || cfg.selectedGesture !== "shake") return;
  void requestShakePermission();
}
