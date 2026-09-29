"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PHONE_CC, PIN_LEN, normPhone } from "@/lib/phone";

// Sign in, or sign up, with a mobile number and a 4-digit PIN — the parwah-hq
// flow. One form, two steps: the number decides which second step you get.
// A number nobody has used yet asks for a name and a new PIN, so there is no
// separate sign-up page to find; a number we know asks for the PIN.
//
// Google sign-in is commented out (see lib/auth.ts). Connecting Google for Gmail
// and Calendar still lives in Settings → Connections, where it always did.

type Step = "phone" | "pin" | "signup" | "setpin";

const CC_CODES = Object.keys(PHONE_CC);

export default function SignInPage() {
  const { status } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<Step>("phone");
  const [cc, setCc] = useState("+91");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  const parsed = useMemo(() => normPhone(phone, cc), [phone, cc]);

  async function checkNumber() {
    if (!parsed) {
      setError(`That does not look like a ${PHONE_CC[cc]?.name ?? "valid"} number.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: parsed.e164, cc }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        exists?: boolean;
        setPin?: boolean;
        error?: string;
      };
      if (!body.ok) {
        setError(body.error ?? "Could not check that number.");
        return;
      }
      // No name comes back from this call on purpose — greeting someone by name
      // before they have proved anything hands it to whoever typed the number.
      setStep(!body.exists ? "signup" : body.setPin ? "setpin" : "pin");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPin() {
    if (pin.length !== PIN_LEN) {
      setError(`Your PIN is ${PIN_LEN} numbers.`);
      return;
    }
    if (step === "signup" && !name.trim()) {
      setError("Please tell us your name.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await signIn("phone", {
      redirect: false,
      phone: parsed?.e164,
      cc,
      pin,
      name: step === "signup" ? name.trim() : undefined,
      callbackUrl: "/dashboard",
    });
    if (res?.ok) {
      router.push("/dashboard");
      return;
    }
    // A wrong PIN says how many tries are left, and a locked account how long
    // for, so the message from the server is shown as-is.
    setPin("");
    setError(res?.error ?? "That did not work. Please try again.");
    setBusy(false);
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background-base flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const onPhoneStep = step === "phone";

  return (
    <div className="min-h-screen bg-background-base flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-accent-violet/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
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

        {/* Card */}
        <div className="bg-background-surface border border-border-default rounded-card p-8 shadow-elevated">
          <h2 className="text-text-primary font-semibold text-base mb-1 text-center">
            {onPhoneStep
              ? "Sign in to continue"
              : step === "signup"
                ? "Create your account"
                : step === "setpin"
                  ? "Choose a PIN"
                  : "Welcome back"}
          </h2>
          <p className="text-text-muted text-xs text-center mb-6">
            {onPhoneStep
              ? "Your mobile number and a 4-digit PIN. Nothing else."
              : parsed?.e164}
          </p>

          {error && (
            <div className="mb-5 p-3 bg-accent-red/10 border border-accent-red/20 rounded-input text-accent-red text-sm text-center">
              {error}
            </div>
          )}

          {onPhoneStep ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="phone" className="block text-text-secondary text-xs mb-2">
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="Country code"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    className="bg-background-elevated border border-border-hover rounded-input px-2 h-12 text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                  >
                    {CC_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 14))}
                    onKeyDown={(e) => e.key === "Enter" && checkNumber()}
                    placeholder={cc === "+91" ? "98765 43210" : "Your number"}
                    className="flex-1 min-w-0 bg-background-elevated border border-border-hover rounded-input px-3 h-12 text-text-primary text-sm tracking-wide focus:outline-none focus:border-accent-blue"
                  />
                </div>
              </div>
              <button
                onClick={checkNumber}
                disabled={busy || !parsed}
                className="w-full flex items-center justify-center gap-2 bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-white text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {busy ? <Spinner /> : "Continue"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {step === "signup" && (
                <div>
                  <label htmlFor="name" className="block text-text-secondary text-xs mb-2">
                    Your name
                  </label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    autoFocus
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-background-elevated border border-border-hover rounded-input px-3 h-12 text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                  />
                </div>
              )}
              <div>
                <label htmlFor="pin" className="block text-text-secondary text-xs mb-2">
                  {step === "pin" ? `Your ${PIN_LEN}-digit PIN` : `Choose a ${PIN_LEN}-digit PIN`}
                </label>
                <input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus={step !== "signup"}
                  maxLength={PIN_LEN}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, "").slice(0, PIN_LEN))}
                  onKeyDown={(e) => e.key === "Enter" && submitPin()}
                  className="w-full bg-background-elevated border border-border-hover rounded-input px-3 h-12 text-text-primary text-lg text-center tracking-[0.6em] focus:outline-none focus:border-accent-blue"
                />
                {step !== "pin" && (
                  <p className="text-text-muted text-xs mt-2 leading-relaxed">
                    {PIN_LEN} numbers you will remember, and that nobody would guess first.
                    It is what stops someone who knows your number opening your account.
                  </p>
                )}
              </div>
              <button
                onClick={submitPin}
                disabled={busy || pin.length !== PIN_LEN}
                className="w-full flex items-center justify-center gap-2 bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-white text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {busy ? <Spinner /> : step === "pin" ? "Sign in" : "Set my PIN & continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setPin("");
                  setError(null);
                }}
                className="w-full text-text-muted hover:text-text-secondary text-xs transition-colors"
              >
                Use a different number
              </button>
            </div>
          )}

          <p className="text-text-muted text-xs text-center mt-5 leading-relaxed">
            By continuing, you agree to our{" "}
            <Link href="/terms_of_service" className="text-accent-blue hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy_policy" className="text-accent-blue hover:underline">
              Privacy Policy
            </Link>
            . Your data is self-hosted and never shared.
          </p>
        </div>

        <p className="text-text-muted text-xs font-mono text-center mt-6">v0.1.0 · Phase 1</p>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />;
}
