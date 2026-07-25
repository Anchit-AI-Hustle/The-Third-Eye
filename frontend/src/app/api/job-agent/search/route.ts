import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { JOB_AGENT } from "@/lib/jobAgent/config";
import { runSearch } from "@/lib/jobAgent/sources";
import type { JobSearchInput } from "@/lib/jobAgent/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Multi-source job search. Auth-gated + feature-flagged. Concurrent providers,
// partial-failure tolerant (see runSearch). No secrets ever reach the client.
export async function POST(req: NextRequest) {
  if (!JOB_AGENT.enabled) return Response.json({ error: "Job Agent is disabled", disabled: true }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: JobSearchInput;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const query = (body.query || "").toString().trim().slice(0, 200);
  if (!query) return Response.json({ error: "A search query is required" }, { status: 400 });

  const input: JobSearchInput = {
    query,
    location: body.location?.toString().slice(0, 120),
    remotePreference: body.remotePreference,
    employmentTypes: Array.isArray(body.employmentTypes) ? body.employmentTypes.slice(0, 8) : undefined,
    experienceLevels: Array.isArray(body.experienceLevels) ? body.experienceLevels.slice(0, 8) : undefined,
    datePosted: body.datePosted,
    salaryMin: typeof body.salaryMin === "number" ? body.salaryMin : undefined,
    salaryCurrency: body.salaryCurrency?.toString().slice(0, 8),
    visaSponsorship: body.visaSponsorship,
    page: typeof body.page === "number" ? Math.max(1, Math.min(body.page, 20)) : 1,
    limit: typeof body.limit === "number" ? Math.max(1, Math.min(body.limit, 50)) : 25,
    sources: Array.isArray(body.sources) ? body.sources.slice(0, 12).map(String) : undefined,
  };

  try {
    const result = await runSearch(input);
    return Response.json(result);
  } catch (e) {
    console.error("job-agent search:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Search failed — please try again." }, { status: 502 });
  }
}
