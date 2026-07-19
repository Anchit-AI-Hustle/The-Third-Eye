import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { JOB_AGENT } from "@/lib/jobAgent/config";
import { buildApplicationKit } from "@/lib/jobAgent/applicationKit";
import type { CandidateFact, CareerProfile, NormalizedJob } from "@/lib/jobAgent/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Idempotent-per-request application kit. The client supplies the job snapshot
// plus the authenticated user's own profile + verified facts (which it manages
// via the data API / local storage). We never accept another user's data — the
// kit is generated only from what the caller owns.
export async function POST(req: NextRequest) {
  if (!JOB_AGENT.enabled) return Response.json({ error: "Job Agent is disabled", disabled: true }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { job?: NormalizedJob; profile?: CareerProfile; facts?: CandidateFact[]; questions?: string[]; baseResume?: any };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.job?.title || !body.job?.company) return Response.json({ error: "A valid job snapshot is required" }, { status: 400 });

  const facts = Array.isArray(body.facts) ? body.facts.slice(0, 400) : [];
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const questions = Array.isArray(body.questions) ? body.questions.slice(0, 30).map(String) : [];

  try {
    const kit = await buildApplicationKit({
      job: body.job,
      profile,
      facts,
      baseResume: body.baseResume ?? null,
      questions,
    });
    return Response.json({ kit });
  } catch (e) {
    console.error("job-agent kit:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Application kit generation failed — please try again." }, { status: 502 });
  }
}
