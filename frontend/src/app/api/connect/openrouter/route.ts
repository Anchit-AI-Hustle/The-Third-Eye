import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { originFromRequest } from "@/lib/googleToken";

export const runtime = "nodejs";

// OpenRouter is excluded by the owner: no sign-in is started and OpenRouter is not contacted.
export async function GET(req: Request) {
  if (!(await getServerSession(authOptions))?.user?.email) return new NextResponse("Not authenticated", { status: 401 });
  return NextResponse.redirect(`${originFromRequest(req)}/settings?tab=agent&connect=openrouter_error&why=${encodeURIComponent("OpenRouter is not used by this app.")}`);
}
