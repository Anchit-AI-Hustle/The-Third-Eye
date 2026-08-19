"use client";
// web/app/auth/AuthForm.tsx — the four sign-in methods, ported from the prototype.
// Real auth via Supabase (lib/auth.ts). Aadhaar sign-in is a Phase-2 stub (KYC provider).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/kolab-studio/Logo";
import { Button, Input, Label } from "@/components/kolab-studio/ui";
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  sendEmailOtp,
  verifyEmailOtp,
  signInWithPassword,
  signUpWithPassword,
  oauth,
  testSignIn,
} from "@/lib/kolab-studio/auth";

type Method = "mobile" | "aadhaar" | "email" | "test";

export function AuthForm({ devMode }: { devMode: boolean }) {
  const router = useRouter();
  const methods: Method[] = devMode ? ["mobile", "aadhaar", "email", "test"] : ["mobile", "aadhaar", "email"];
  const [method, setMethod] = useState<Method>("mobile");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [otpStage, setOtpStage] = useState(false);
  const isSignup = authMode === "signup";
  const createUser = isSignup; // OTP: create the account on sign-up, require existing on sign-in

  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [testNum, setTestNum] = useState("");

  async function run(fn: () => Promise<unknown>, thenApp = false) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      if (thenApp) router.push("/kolab/studio/home");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col justify-center border-b border-kolab-line bg-kolab-surface p-[clamp(28px,5vw,56px)] md:border-b-0 md:border-r">
        <div className="mb-8">
          <Logo />
        </div>
        <h1 className="mb-4 text-[clamp(30px,5vw,50px)]">
          Where <span className="text-kolab-lime">creators</span> and brands grow together.
        </h1>
        <p className="max-w-[44ch] text-[16px] text-kolab-muted">
          One place to run your content, link every channel, launch a coupon storefront, and get
          paid — and for brands to find and partner with verified creators.
        </p>
      </div>

      <div className="flex flex-col justify-center p-[clamp(24px,5vw,48px)]">
        <div className="mx-auto w-full max-w-[400px]">
          <h2 className="text-[24px]">{isSignup ? "Create your account" : "Sign in"}</h2>
          <div className="mb-4 text-[13px] text-kolab-muted">
            {isSignup
              ? "Sign up to create your Kolab space."
              : "Welcome back — sign in to your space."}
          </div>

          <div className="mb-5 flex gap-1.5 rounded-[11px] border border-kolab-line bg-kolab-surface p-[5px]">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setAuthMode(m);
                  setOtpStage(false);
                  setErr(null);
                }}
                className={`flex-1 rounded-lg py-2.5 font-kolab-mono text-[11px] font-bold uppercase tracking-[0.04em] ${
                  authMode === m ? "bg-kolab-lime text-kolab-base" : "text-kolab-muted"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <div className="mb-5 flex flex-wrap gap-1.5 rounded-[11px] border border-kolab-line bg-kolab-surface p-[5px]">
            {methods.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMethod(m);
                  setOtpStage(false);
                  setErr(null);
                }}
                className={`min-w-[70px] flex-1 rounded-lg px-1.5 py-2.5 font-kolab-mono text-[10px] font-bold uppercase tracking-[0.04em] ${
                  method === m ? "bg-kolab-lime text-kolab-base" : "text-kolab-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {err && (
            <div className="mb-3.5 rounded-lg border border-kolab-clay/40 bg-kolab-clay/10 px-3 py-2.5 font-kolab-mono text-[11px] text-kolab-clay">
              {err}
            </div>
          )}

          {method === "mobile" && (
            <div>
              <div className="mb-3.5">
                <Label>Mobile number</Label>
                <Input
                  inputMode="numeric"
                  placeholder="+91 …"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
              {otpStage && (
                <div className="mb-3.5">
                  <Label>Enter OTP</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>
              )}
              <Button
                variant="primary"
                block
                disabled={busy}
                onClick={() =>
                  otpStage
                    ? run(() => verifyPhoneOtp(mobile, otp), true)
                    : run(async () => {
                        await sendPhoneOtp(mobile, createUser);
                        setOtpStage(true);
                      })
                }
              >
                {otpStage ? "Verify & sign in" : "Send OTP"}
              </Button>
            </div>
          )}

          {method === "aadhaar" && (
            <div>
              <div className="mb-3.5 rounded-lg border border-dashed border-kolab-line bg-kolab-surface2 px-3 py-2.5 font-kolab-mono text-[11px] text-kolab-faint">
                Aadhaar sign-in runs through a UIDAI-licensed KYC provider (Phase 2). Use Mobile or
                Email to sign in, then verify Aadhaar in Profile Setup.
              </div>
              <Button block disabled onClick={() => {}}>
                Coming in Phase 2
              </Button>
            </div>
          )}

          {method === "email" && (
            <div>
              <div className="mb-3.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="you@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="mb-3.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                block
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    if (isSignup) {
                      await signUpWithPassword(email, password);
                      // With email confirmations off the sign-up returns a session; sign in to be safe.
                      await signInWithPassword(email, password);
                    } else {
                      await signInWithPassword(email, password);
                    }
                  }, true)
                }
              >
                {isSignup ? "Create account" : "Sign in"}
              </Button>
              {/* OAuth is inherently a "continue" flow — the provider signs you in or creates the
                  account in one step, so it is intentionally mode-agnostic and labelled as such
                  (it does not claim to honour the strict sign-in/sign-up split above). */}
              <div className="mt-4 mb-1.5 text-center font-kolab-mono text-[10px] uppercase tracking-[0.1em] text-kolab-faint">
                Or continue with
              </div>
              <div className="flex gap-2">
                {(["google", "apple", "facebook"] as const).map((p) => (
                  <Button key={p} className="flex-1 text-[11px]" onClick={() => run(() => oauth(p))}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
              <div className="mt-3.5 text-center">
                <button
                  className="font-kolab-mono text-[11px] text-kolab-muted underline"
                  onClick={() =>
                    run(async () => {
                      await sendEmailOtp(email, createUser);
                      setOtpStage(true); // reveal the code input, same as the mobile OTP path
                    })
                  }
                >
                  Email me a one-time code instead
                </button>
              </div>
              {otpStage && (
                <div className="mt-3.5">
                  <Label>Enter emailed code</Label>
                  <Input value={otp} onChange={(e) => setOtp(e.target.value)} />
                  <Button
                    className="mt-2"
                    variant="primary"
                    block
                    onClick={() => run(() => verifyEmailOtp(email, otp), true)}
                  >
                    Verify code
                  </Button>
                </div>
              )}
            </div>
          )}

          {method === "test" && devMode && (
            <div>
              <div className="mb-3.5 rounded-lg border border-dashed border-kolab-line bg-kolab-surface2 px-3 py-2.5 font-kolab-mono text-[11px] text-kolab-faint">
                Test Sign-In — no OTP. KOLAB_DEV_MODE only; disabled in production.
              </div>
              <div className="mb-3.5">
                <Label>Any mobile number</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Enter any number"
                  value={testNum}
                  onChange={(e) => setTestNum(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                block
                disabled={busy}
                onClick={() => run(() => testSignIn(testNum), true)}
              >
                Sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
