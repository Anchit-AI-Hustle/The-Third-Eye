"use client";

import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { PHONE_CC, PIN_LEN, normPhone, phoneError, pinError } from "@/lib/phone";

const ERROR_TEXT: Record<string, string> = {
  Configuration: "Sign-in isn't configured on the server.",
  CredentialsSignin: "That did not work. Check your number and PIN and try again.",
  SessionRequired: "Please sign in to see that page.",
};

type Step = "phone" | "pin" | "new";

const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

const inputClass =
  "w-full bg-background-base border border-border-default rounded-input px-3 h-12 text-text-primary text-sm focus:outline-none focus:border-accent-blue";

export function SignInClient({
  callbackUrl,
  initialError,
}: {
  callbackUrl: string;
  initialError: string | null;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [cc, setCc] = useState("+91");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? (ERROR_TEXT[initialError] ?? "Sign-in didn't finish. Please try again.") : null,
  );

  async function checkNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normPhone(phone, cc)) {
      setError(phoneError(cc));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, cc }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; exists?: boolean; error?: string };
      if (!body.ok) {
        setError(body.error ?? "Could not check that number. Please try again.");
        return;
      }
      setPin("");
      setStep(body.exists ? "pin" : "new");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem =
      step === "new"
        ? !name.trim()
          ? "Please type your name."
          : pinError(pin)
        : pin.length === PIN_LEN
          ? null
          : `Your PIN is ${PIN_LEN} numbers.`;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("phone", {
        redirect: false,
        phone,
        cc,
        pin,
        ...(step === "new" ? { name: name.trim() } : {}),
        callbackUrl,
      });
      if (res?.ok && !res.error) {
        window.location.assign(callbackUrl);
        return;
      }
      setPin("");
      setError(
        res?.error && res.error !== "CredentialsSignin"
          ? res.error
          : "That did not work. Check your number and PIN and try again.",
      );
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeNumber() {
    setStep("phone");
    setPin("");
    setError(null);
  }

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
            {step === "new" ? "Create your account" : "Sign in to continue"}
          </h2>
          <p className="text-text-muted text-xs text-center mb-6">
            {step === "phone"
              ? "Type your mobile number."
              : step === "pin"
                ? `Type your ${PIN_LEN}-digit PIN.`
                : `New number. Type your name and choose a ${PIN_LEN}-digit PIN.`}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-5 p-3 bg-accent-red/10 border border-accent-red/20 rounded-input text-accent-red text-sm text-center"
            >
              {error}
            </div>
          )}

          {step === "phone" ? (
            <form className="w-full space-y-3" onSubmit={checkNumber} noValidate>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="signin-cc">
                  Country code
                </label>
                <select
                  id="signin-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className={`${inputClass} w-28 shrink-0`}
                >
                  {Object.entries(PHONE_CC).map(([code, r]) => (
                    <option key={code} value={code}>
                      {code} {r.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="signin-phone">
                  Mobile number
                </label>
                <input
                  id="signin-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="Mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={busy || !phone.trim()}
                className="w-full flex items-center justify-center bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-white text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            <form className="w-full space-y-3" onSubmit={submitPin} noValidate>
              <p className="text-text-secondary text-sm text-center">
                {cc} {phone}{" "}
                <button type="button" onClick={changeNumber} className="text-accent-blue underline">
                  Change
                </button>
              </p>
              {step === "new" && (
                <>
                  <label className="sr-only" htmlFor="signin-name">
                    Your name
                  </label>
                  <input
                    id="signin-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    autoFocus
                  />
                </>
              )}
              <label className="sr-only" htmlFor="signin-pin">
                {PIN_LEN}-digit PIN
              </label>
              <input
                id="signin-pin"
                type="password"
                inputMode="numeric"
                pattern={`\\d{${PIN_LEN}}`}
                maxLength={PIN_LEN}
                autoComplete={step === "new" ? "new-password" : "current-password"}
                placeholder={`${PIN_LEN}-digit PIN`}
                value={pin}
                onChange={(e) => setPin(digits(e.target.value, PIN_LEN))}
                className={`${inputClass} text-center tracking-[0.5em]`}
                autoFocus={step === "pin"}
              />
              <button
                type="submit"
                disabled={busy || pin.length !== PIN_LEN}
                className="w-full flex items-center justify-center bg-accent-blue hover:brightness-110 rounded-input px-4 h-12 text-white text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {busy ? "Signing in…" : step === "new" ? "Create account" : "Sign in"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
