import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ai: !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY),
    openai: !!process.env.OPENAI_API_KEY,
    supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    google_oauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    serper: !!process.env.SERPER_API_KEY,
  });
}
