"use client";

import { getCsrfToken } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/layout/LogoMark";

// Opened by /api/app-signin for a signed-out app: no screen to tap through,
// just Google, which comes back to /api/app-signin.
export default function AppSignInPage() {
  const form = useRef<HTMLFormElement>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getCsrfToken().then((t) => (t ? setCsrfToken(t) : setFailed(true))).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (csrfToken) form.current?.submit();
  }, [csrfToken]);

  return (
    <main className="min-h-screen bg-background-base flex flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark size={72} />
      <form ref={form} method="post" action="/api/auth/signin/google">
        <input type="hidden" name="csrfToken" value={csrfToken} />
        <input type="hidden" name="callbackUrl" value="/api/app-signin" />
      </form>
      {failed ? (
        <button type="button" onClick={() => window.location.reload()} className="text-accent-blue text-sm">
          Couldn&apos;t reach Google. Try again
        </button>
      ) : (
        <p className="text-text-secondary text-sm">Opening Google…</p>
      )}
    </main>
  );
}
