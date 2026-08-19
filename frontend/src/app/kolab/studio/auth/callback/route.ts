// web/app/auth/callback/route.ts — OAuth / magic-link code exchange, then into the app.
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/kolab-studio/supabaseServer";
import { env } from "@/lib/kolab-studio/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const appUrl = env.appUrl();

  if (code) {
    const supabase = supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${appUrl}/kolab/studio/auth?error=oauth`);
    }
  }
  return NextResponse.redirect(`${appUrl}/kolab/studio/home`);
}
