"use client";

import { getCsrfToken } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";
import { Welcome, WELCOME_SEEN } from "@/components/onboarding/Welcome";

// A home-screen app keeps its own cookies, apart from Safari where Google
// sign-in finishes, and Google refuses sign-in inside the native app's web
// view, so both sign in through /auth/handoff instead.
function inHomeScreenApp(): boolean {
  if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return true;
  return (navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

const ERROR_TEXT: Record<string, string> = {
  AccessDenied: "Google didn't allow that sign-in. It only needs your name and email.",
  OAuthCallback: "Google didn't finish. Continue once more.",
  Callback: "Google didn't finish. Continue once more.",
  OAuthSignin: "Couldn't start Google sign-in.",
  Configuration: "Sign-in isn't configured on the server.",
};

export function SignInClient({
  callbackUrl,
  initialError,
}: {
  callbackUrl: string;
  initialError: string | null;
}) {
  const [csrfToken, setCsrfToken] = useState("");
  const [csrfError, setCsrfError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [handoff, setHandoff] = useState<string | null>(null);

  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    setStandalone(inHomeScreenApp());
    let seen = false;
    try { seen = localStorage.getItem(WELCOME_SEEN) === "1"; } catch { /* treat as unseen */ }
    setWelcome(!seen);
  }, []);

  useEffect(() => {
    if (!handoff) return;
    const poll = async () => {
      const r = await fetch(`/api/auth/handoff?code=${handoff}`).then((res) => res.json()).catch(() => null);
      if (r?.signedIn) window.location.assign(callbackUrl);
    };
    const id = setInterval(poll, 2000);
    document.addEventListener("visibilitychange", poll);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", poll); };
  }, [handoff, callbackUrl]);

  async function startHandoff() {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    // Open first, still inside the tap: iOS drops a window opened after an await.
    // The code is registered long before the person reaches Approve.
    window.open(`/auth/handoff?code=${code}`, "_blank");
    await fetch("/api/auth/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    setHandoff(code);
  }

  useEffect(() => {
    let cancelled = false;
    getCsrfToken()
      .then((token) => {
        if (cancelled) return;
        if (!token) {
          setCsrfError(true);
          return;
        }
        setCsrfToken(token);
      })
      .catch(() => {
        if (!cancelled) setCsrfError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function startGoogle(event: FormEvent<HTMLFormElement>) {
    if (!csrfToken) {
      event.preventDefault();
      setCsrfError(true);
      return;
    }
    setBusy(true);
  }

  const message = csrfError
    ? "Couldn't start Google sign-in."
    : initialError
      ? (ERROR_TEXT[initialError] ?? "Sign-in didn't finish. Continue once more.")
      : null;

  if (welcome) return <Welcome onDone={() => setWelcome(false)} />;

  return (
    <div className="min-h-screen bg-background-base flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-accent-violet/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 overflow-hidden mb-5 shadow-elevated">
            <img
              src="/logo.png"
              alt="The Third Eye"
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-accent-blue font-bold text-2xl font-display">👁</div>`;
              }}
            />
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary tracking-tight">
            The Third Eye
          </h1>
          <p className="text-text-secondary text-sm mt-2">
            Your Personal Intelligence Operating System
          </p>
        </div>

        <div className="bg-background-surface border border-border-default rounded-card p-8 shadow-elevated">
          <h2 className="text-text-primary font-semibold text-base mb-1 text-center">
            Sign in to continue
          </h2>
          <p className="text-text-muted text-xs text-center mb-6">
            One Google step. It asks for your name and email, then opens your workspace.
          </p>

          {message && (
            <div
              role="alert"
              className="mb-5 p-3 bg-accent-red/10 border border-accent-red/20 rounded-input text-accent-red text-sm text-center"
            >
              {message}
              {initialError && !csrfError && (
                <p className="mt-1 text-xs text-text-muted">{initialError}</p>
              )}
            </div>
          )}

          {standalone ? (
            handoff ? (
              <div className="text-center space-y-2" aria-live="polite">
                <p className="text-text-primary text-sm">Finish signing in with Google in Safari, approve code</p>
                <p className="font-display text-2xl font-semibold tracking-widest text-accent-blue">{handoff.slice(0, 4).toUpperCase()}</p>
                <p className="text-text-muted text-xs">then come back here. This screen opens your workspace by itself.</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={startHandoff}
                className="w-full flex items-center justify-center gap-2 bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-background-base text-sm font-medium transition-all duration-150 active:scale-[0.98]"
              >
                Continue with Google
              </button>
            )
          ) : (
          <>
          {/* Native POST. fetch(signIn) set the state cookie on a background
              response that Chrome dropped on the way back from Google. */}
          <form
            method="post"
            action="/api/auth/signin/google"
            className="w-full"
            onSubmit={startGoogle}
          >
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button
              type="submit"
              disabled={busy || !csrfToken}
              className="w-full flex items-center justify-center gap-2 bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-background-base text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
