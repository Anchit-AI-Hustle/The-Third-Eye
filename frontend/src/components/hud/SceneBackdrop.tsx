"use client";

import { useEffect, useState } from "react";
import { HeroCanvas } from "@/components/landing/HeroCanvas";

// iOS kills a page whose WebGL scene costs too much memory, and in the
// home-screen app that crashed the sign-in screen on every open. A screen the
// person must get through gets the glow without the 3D there.
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

// The landing page's 3D eye behind a full screen (welcome, sign-in), veiled so
// the copy on top stays crisp.
export function SceneBackdrop() {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(!isIOS()), []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      {webgl ? (
        <HeroCanvas />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(123,92,240,0.35),rgba(79,195,247,0.12)_35%,transparent_65%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background-base/10 via-background-base/55 to-background-base" />
    </div>
  );
}
