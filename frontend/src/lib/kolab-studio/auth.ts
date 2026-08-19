// web/lib/auth.ts
// REAL mobile + email OTP using Supabase Auth. OTP is generated, sent, rate-limited and
// verified by Supabase server-side — no secrets touch the browser.
//
// Prerequisites (one-time, in the Kolab Supabase dashboard — see integrations/OTP-AADHAAR.md
// in the Kolab repo):
//   • Auth → Providers → Phone: enable + connect an SMS provider (Twilio / MessageBird / Vonage / MSG91).
//   • Auth → Providers → Email: enable Email OTP; set the email template to send {{ .Token }} (6-digit code).
//   • Auth → URL config + rate limits as needed.

import { supabase } from "./supabaseClient";

/* ---------- MOBILE OTP ----------
   shouldCreateUser distinguishes sign-up (create if new) from sign-in (must already exist). */
export async function sendPhoneOtp(phoneE164: string, shouldCreateUser = true) {
  // phone must be E.164, e.g. "+919716125010"
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser },
  });
  if (error) throw error;
  return { sent: true };
}

export async function verifyPhoneOtp(phoneE164: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token,
    type: "sms",
  });
  if (error) throw error;
  return data.session; // authenticated session
}

/* ---------- EMAIL OTP ---------- */
export async function sendEmailOtp(email: string, shouldCreateUser = true) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser },
  });
  if (error) throw error;
  return { sent: true };
}

export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw error;
  return data.session;
}

/* ---------- EMAIL + PASSWORD / OAUTH ---------- */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUpWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function oauth(provider: "google" | "apple" | "facebook") {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_KOLAB_APP_URL}/kolab/studio/auth/callback` },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ---------- TEST SIGN-IN (KOLAB_DEV_MODE only) ----------
   No OTP, for demos. The server route refuses unless KOLAB_DEV_MODE=true; it provisions a dev
   user with the service-role key and returns a one-time email OTP we immediately verify
   client-side. This path is hard-disabled in production. */
export async function testSignIn(phone: string) {
  const res = await fetch("/api/kolab-studio/auth/test-signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const body = await res.json();
  if (!res.ok || !body?.ok) throw new Error(body?.error || "Test sign-in unavailable");
  const { email, token } = body.data as { email: string; token: string };
  return verifyEmailOtp(email, token);
}
