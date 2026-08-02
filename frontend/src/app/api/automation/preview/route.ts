import { NextRequest, NextResponse } from "next/server";
import { runScheduledPost } from "@/lib/automation/scheduler";
import { isAuthorized } from "@/lib/automation/auth";

// Generate a post draft WITHOUT publishing — for reviewing what the automation
// would say. `?seed=N` previews a specific post in the rotation. Gated by
// CRON_SECRET because it can call the LLM.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seedParam = new URL(req.url).searchParams.get("seed");
  const seed = seedParam !== null ? Number(seedParam) : undefined;
  const result = await runScheduledPost({ dryRun: true, seed });
  return NextResponse.json(result);
}
