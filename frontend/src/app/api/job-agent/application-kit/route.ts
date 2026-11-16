import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { JOB_AGENT } from "@/lib/jobAgent/config";
import { buildApplicationKit } from "@/lib/jobAgent/applicationKit";
import { coverLetterToHtml, coverLetterToText, resumeToHtml, resumeToMarkdown } from "@/lib/jobAgent/documents";
import { documentFilename } from "@/lib/jobAgent/normalize";
import type { CandidateFact, CareerProfile, NormalizedJob } from "@/lib/jobAgent/types";
import { chargedRoute } from "@/lib/credits";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// The caller's own saved profile and facts, for the phone apps: the rows keep
// the table's snake_case columns, which the kit reads as CandidateFact.
async function savedInputs(email: string): Promise<{ profile: CareerProfile; facts: CandidateFact[] }> {
  const db = getDb();
  if (!db) return { profile: {}, facts: [] };
  const [p, f] = await Promise.all([
    db.from("job_agent_profiles").select("profile_json").eq("user_id", email).limit(1),
    db.from("candidate_facts").select("*").eq("user_id", email).limit(400),
  ]);
  const facts = (f.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id, factType: r.fact_type ?? r.factType, value: r.value_json ?? r.value,
    sensitivity: r.sensitivity, verified: r.verified, confidence: r.confidence ?? undefined,
  })) as CandidateFact[];
  return { profile: (p.data?.[0]?.profile_json as CareerProfile) ?? {}, facts };
}

// Idempotent-per-request application kit. The client supplies the job snapshot
// plus the authenticated user's own profile + verified facts (which it manages
// via the data API / local storage). We never accept another user's data — the
// kit is generated only from what the caller owns.
async function create(req: NextRequest) {
  if (!JOB_AGENT.enabled) return Response.json({ error: "Job Agent is disabled", disabled: true }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { job?: NormalizedJob; profile?: CareerProfile; facts?: CandidateFact[]; questions?: string[]; baseResume?: any; useSaved?: boolean };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.job?.title || !body.job?.company) return Response.json({ error: "A valid job snapshot is required" }, { status: 400 });

  const saved = body.useSaved === true ? await savedInputs(session.user.email) : null;
  const facts = saved?.facts ?? (Array.isArray(body.facts) ? body.facts.slice(0, 400) : []);
  const profile = saved?.profile ?? (body.profile && typeof body.profile === "object" ? body.profile : {});
  const questions = Array.isArray(body.questions) ? body.questions.slice(0, 30).map(String) : [];

  try {
    const kit = await buildApplicationKit({
      job: body.job,
      profile,
      facts,
      baseResume: body.baseResume ?? null,
      questions,
    });
    // The documents as the website shows and exports them, so the phone apps
    // need no copy of the resume and cover letter layouts.
    const name = profile.fullName || kit.resume.contact.fullName || "Candidate";
    const resumeMarkdown = resumeToMarkdown(kit.resume);
    const documents = {
      resumeHtml: resumeToHtml(kit.resume, { forPrint: true }),
      resumeMarkdown,
      coverHtml: coverLetterToHtml(kit.coverLetter, { forPrint: true }),
      coverText: coverLetterToText(kit.coverLetter),
      resumeName: documentFilename(name, body.job.company, body.job.title, "Resume", "x").replace(/\.x$/, ""),
      coverName: documentFilename(name, body.job.company, body.job.title, "Cover_Letter", "x").replace(/\.x$/, ""),
    };
    return Response.json({ kit, documents });
  } catch (e) {
    console.error("job-agent kit:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Application kit generation failed - please try again." }, { status: 502 });
  }
}

export const POST = chargedRoute("jobagent.kit", create);
