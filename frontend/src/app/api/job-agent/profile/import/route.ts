import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { JOB_AGENT } from "@/lib/jobAgent/config";
import { APPLICATION_AGENT_SYSTEM_PROMPT, untrustedBlock } from "@/lib/jobAgent/prompts";
import type { CandidateFact, CareerProfile } from "@/lib/jobAgent/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Resume/profile import. Accepts pasted text, a .txt body, or a portfolio URL
// (safe server-side fetch). PDF/DOCX binary parsing needs a parser dependency
// not yet installed — those return a clear, graceful message asking the user to
// paste text. Extracted facts are NEVER auto-verified; the user reviews them.
function safeJson<T>(text: string): T | null {
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    return JSON.parse(text.slice(s, e + 1)) as T;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  if (!JOB_AGENT.enabled) return Response.json({ error: "Job Agent is disabled", disabled: true }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: { text?: string; sourceUrl?: string; filename?: string; mimeType?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const text0 = (body.text || "").toString();

  // Portfolio-URL import does a server-side fetch of a user-supplied host (an
  // SSRF surface). It's intentionally disabled in this build pending a
  // DNS-pinned fetch service; paste the page text instead.
  if (!text0 && body.sourceUrl) {
    return Response.json({
      error: "Portfolio-URL import is a staged follow-up. Please paste your resume/portfolio text instead.",
      code: "url_import_staged",
    }, { status: 422 });
  }

  let text = text0;

  // Binary formats need a parser we don't ship yet — fail gracefully.
  if (!text && body.mimeType && /pdf|word|officedocument/i.test(body.mimeType)) {
    return Response.json({
      error: "PDF/DOCX parsing isn't enabled in this build. Please paste your resume text, or provide a portfolio URL.",
      code: "parser_unavailable",
    }, { status: 422 });
  }

  text = text.trim();
  if (!text || text.length < 40) return Response.json({ error: "Please paste at least a few lines of resume text." }, { status: 400 });
  if (text.length > 40000) text = text.slice(0, 40000);

  const prompt = `Extract a career profile from the resume text below. Return JSON:
{ "profile": { "fullName","headline","email","phone","city","region","country","portfolioUrl","linkedinUrl","githubUrl","summary","yearsExperience","targetRoles":[] }, "facts": [ { "factType": "skill|tool|experience|education|project|certification|award|language|summary|link", "value": <string or object>, "originalText": string, "confidence": 0..1, "sensitivity": "normal|sensitive|protected" } ] }
Rules: extract ONLY what is present. Do not invent. Keep exact dates/metrics/employers/titles. Classify demographic/health/protected data as sensitivity="protected". Return valid JSON only.

${untrustedBlock("resume_text", text)}`;

  try {
    const out = await llmCascade({
      system: APPLICATION_AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      jsonMode: true, temperature: 0.1, maxTokens: 2500, stage: "job-agent:import",
    });
    const parsed = safeJson<{ profile?: Partial<CareerProfile>; facts?: any[] }>(out.text);
    if (!parsed) return Response.json({ error: "Could not parse the resume automatically. You can still fill your profile manually." }, { status: 422 });

    const now = new Date().toISOString();
    const facts: CandidateFact[] = (parsed.facts || []).slice(0, 300).map((f, i) => ({
      id: `fact_${Date.now().toString(36)}_${i}`,
      factType: String(f.factType || "note"),
      value: f.value ?? "",
      originalText: f.originalText ? String(f.originalText).slice(0, 500) : undefined,
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
      verified: "unverified", // NEVER auto-verify extracted facts
      sensitivity: ["sensitive", "protected"].includes(f.sensitivity) ? f.sensitivity : "normal",
      updatedAt: now,
    }));
    return Response.json({ profile: parsed.profile || {}, facts, provider: out.provider });
  } catch (e) {
    console.error("job-agent import:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Import failed — AI provider unavailable. You can fill your profile manually." }, { status: 503 });
  }
}
