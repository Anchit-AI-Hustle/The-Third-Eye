import { NextRequest, NextResponse } from "next/server";
import { runScheduledPost } from "@/lib/automation/scheduler";
import { isAuthorized } from "@/lib/automation/auth";

// Fully-automated daily poster. Point a Vercel Cron (or any scheduler) at this
// route — it generates the day's post and publishes to every connected channel.
// Add `?dry=1` to generate without posting. Protected by CRON_SECRET.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const result = await runScheduledPost({ dryRun });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
