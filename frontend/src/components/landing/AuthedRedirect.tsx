"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// Safety net: if a signed-in user ever lands on the marketing home (e.g. the
// PWA start_url, a cached page, or a cookie-timing race right after OAuth where
// the server render didn't yet see the session), send them straight to the
// dashboard so a proper homepage always loads after sign-in.
export function AuthedRedirect() {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);
  return null;
}
