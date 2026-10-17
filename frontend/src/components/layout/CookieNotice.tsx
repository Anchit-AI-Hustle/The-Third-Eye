"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SEEN = "jarvis_cookie_notice";

// The site sets only cookies it needs to work (sign-in, OAuth state, the active
// Kolab organisation), and Vercel Web Analytics is cookie-free, so this is a
// notice with an acknowledgement rather than an opt-in for tracking.
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(localStorage.getItem(SEEN) !== "1"); } catch { /* private mode: no notice */ }
  }, []);
  if (!show) return null;
  const ok = () => {
    try { localStorage.setItem(SEEN, "1"); } catch { /* private mode */ }
    setShow(false);
  };
  return (
    <div role="region" aria-label="Cookie notice" className="fixed z-[80] left-1/2 -translate-x-1/2 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] lg:bottom-6 w-[min(92vw,460px)] rounded-card border border-border-default bg-background-surface/95 backdrop-blur p-4 shadow-lg">
      <p className="text-xs text-text-secondary">
        We use only the cookies needed to keep you signed in and secure. Our analytics use no cookies. See the{" "}
        <Link href="/privacy_policy#cookies" className="text-accent-blue underline underline-offset-2">privacy policy</Link>.
      </p>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={ok} className="px-4 py-1.5 rounded-input text-xs font-medium bg-accent-blue text-black">OK</button>
      </div>
    </div>
  );
}
