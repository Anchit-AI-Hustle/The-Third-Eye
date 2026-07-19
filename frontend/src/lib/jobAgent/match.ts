import type { CandidateFact, CareerProfile, Eligibility, MatchAnalysis, NormalizedJob, RecommendedAction, ScoreComponent } from "./types";
import { htmlToText } from "./sanitize";

// Transparent, deterministic candidate-side relevance heuristic. This is NOT an
// employer decision or a probability of being hired — it's a weighted overlap
// score between the candidate's VERIFIED facts and the job posting, plus hard
// eligibility penalties. Every matched requirement references candidate fact IDs.
// Protected/sensitive facts are never used in scoring.

const WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: "skills", label: "Skills & tools", weight: 0.3 },
  { key: "evidence", label: "Relevant work evidence", weight: 0.2 },
  { key: "title", label: "Role / title alignment", weight: 0.15 },
  { key: "seniority", label: "Seniority alignment", weight: 0.1 },
  { key: "responsibility", label: "Responsibility alignment", weight: 0.1 },
  { key: "industry", label: "Industry / domain", weight: 0.05 },
  { key: "location", label: "Location & work authorization", weight: 0.05 },
  { key: "preferences", label: "Your preferences", weight: 0.05 },
];

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9+#. ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

function skillFacts(facts: CandidateFact[]): { id: string; value: string }[] {
  return facts
    .filter((f) => f.sensitivity === "normal" && f.verified !== "rejected")
    .filter((f) => ["skill", "tool", "technology", "certification"].includes(f.factType))
    .map((f) => ({ id: f.id, value: String(typeof f.value === "string" ? f.value : JSON.stringify(f.value)).toLowerCase() }));
}

function evidenceText(facts: CandidateFact[]): { id: string; text: string }[] {
  return facts
    .filter((f) => f.sensitivity === "normal" && f.verified !== "rejected")
    .filter((f) => ["experience", "project", "summary", "award", "publication"].includes(f.factType))
    .map((f) => ({ id: f.id, text: (f.originalText || JSON.stringify(f.value)).toLowerCase() }));
}

function overlapScore(needle: Set<string>, hay: Set<string>): number {
  if (needle.size === 0) return 0;
  let hits = 0;
  needle.forEach((t) => { if (hay.has(t)) hits++; });
  return Math.round((hits / needle.size) * 100);
}

export function scoreMatch(job: NormalizedJob, profile: CareerProfile, facts: CandidateFact[]): MatchAnalysis {
  const jobText = `${job.title} ${job.descriptionText || htmlToText(job.descriptionHtml)} ${(job.skills || []).join(" ")} ${(job.requirements || []).join(" ")}`;
  const jobTokens = tokens(jobText);
  const titleTokens = tokens(job.title);

  const skills = skillFacts(facts);
  const evidence = evidenceText(facts);
  const matched: MatchAnalysis["matchedRequirements"] = [];
  const missing: string[] = [];

  // Skills component: what fraction of the candidate's skills appear in the job.
  const candidateSkillTokens = new Set<string>();
  const skillIdByToken = new Map<string, string>();
  for (const s of skills) for (const t of tokens(s.value)) { candidateSkillTokens.add(t); skillIdByToken.set(t, s.id); }
  let skillHits = 0;
  candidateSkillTokens.forEach((t) => {
    if (jobTokens.has(t)) {
      skillHits++;
      const fid = skillIdByToken.get(t);
      if (fid) matched.push({ requirement: t, candidateFactIds: [fid], explanation: `Your profile lists "${t}", which appears in the posting.` });
    }
  });
  const skillsScore = candidateSkillTokens.size ? Math.min(100, Math.round((skillHits / Math.max(6, candidateSkillTokens.size)) * 130)) : 0;

  // Requirements the job asks for that we can't evidence → missing.
  for (const req of job.requirements || []) {
    const reqTok = tokens(req);
    const covered = Array.from(reqTok).some((t) => candidateSkillTokens.has(t) || jobTokens.has(t) && evidence.some((e) => e.text.includes(t)));
    if (!covered && req.length < 120) missing.push(req);
  }

  // Evidence component: candidate experience terms present in job.
  const evidenceTokens = new Set<string>();
  const evIdByToken = new Map<string, string>();
  for (const e of evidence) for (const t of tokens(e.text)) { evidenceTokens.add(t); if (!evIdByToken.has(t)) evIdByToken.set(t, e.id); }
  const evidenceScore = overlapScore(jobTokens, evidenceTokens);

  // Title alignment.
  const targetTitleTokens = new Set<string>((profile.targetRoles || []).flatMap((r) => Array.from(tokens(r))));
  let titleScore = 0;
  if (targetTitleTokens.size) titleScore = overlapScore(titleTokens, targetTitleTokens);
  else titleScore = evidence.some((e) => Array.from(titleTokens).some((t) => e.text.includes(t))) ? 60 : 30;

  // Seniority.
  const jobSenior = /\b(senior|lead|principal|staff|head|director|vp)\b/i.test(job.title);
  const jobJunior = /\b(junior|intern|entry|graduate|trainee)\b/i.test(job.title);
  const yrs = profile.yearsExperience ?? 0;
  let seniorityScore = 70;
  const penalties: string[] = [];
  if (jobSenior && yrs > 0 && yrs < 4) { seniorityScore = 35; }
  if (jobJunior && yrs >= 8) { seniorityScore = 45; }
  if (!jobSenior && !jobJunior) seniorityScore = 75;

  // Responsibility overlap (uses job description tokens vs evidence).
  const responsibilityScore = Math.round((evidenceScore + skillsScore) / 2);

  // Industry.
  const industryTokens = new Set<string>((profile.targetIndustries || []).flatMap((r) => Array.from(tokens(r))));
  const industryScore = industryTokens.size ? overlapScore(jobTokens, industryTokens) : 50;

  // Location + work authorization (hard penalties applied here).
  let locationScore = 70;
  let eligibility: Eligibility = "likely_eligible";
  const jobRemote = (job.remoteType || "").toLowerCase().includes("remote") || /\bremote\b/i.test(job.descriptionText || "");
  if (profile.remotePreference === "remote" && !jobRemote && job.locationText && !/(remote|anywhere)/i.test(job.locationText)) {
    locationScore = 40;
  }
  if (/\b(us citizen|citizenship required|security clearance|must be located in)\b/i.test(job.descriptionText || "")) {
    if (profile.needsSponsorship) { locationScore = 10; eligibility = "likely_ineligible"; penalties.push("Posting appears to require citizenship/clearance you may not hold."); }
    else { eligibility = "uncertain"; }
  }
  if (/\b(no visa sponsorship|not able to sponsor|without sponsorship)\b/i.test(job.descriptionText || "") && profile.needsSponsorship) {
    locationScore = 10; eligibility = "likely_ineligible"; penalties.push("Posting states no visa sponsorship, but you require sponsorship.");
  }

  // Preferences / exclusions.
  let preferencesScore = 70;
  for (const ex of profile.exclusions || []) {
    if (ex && jobText.toLowerCase().includes(ex.toLowerCase())) { preferencesScore = 10; penalties.push(`Matches your exclusion: "${ex}".`); }
  }

  const raw: Record<string, number> = {
    skills: skillsScore,
    evidence: evidenceScore,
    title: titleScore,
    seniority: seniorityScore,
    responsibility: responsibilityScore,
    industry: industryScore,
    location: locationScore,
    preferences: preferencesScore,
  };
  const breakdown: ScoreComponent[] = WEIGHTS.map((w) => ({ key: w.key, label: w.label, weight: w.weight, score: raw[w.key] ?? 0 }));
  let overall = Math.round(breakdown.reduce((s, c) => s + c.score * c.weight, 0));
  overall = Math.max(0, Math.min(100, overall));

  // Confidence: higher when we actually have facts to reason over.
  const factSignal = Math.min(1, (skills.length + evidence.length) / 12);
  const confidence = Math.round((0.35 + 0.6 * factSignal) * 100) / 100;

  if (eligibility === "likely_eligible" && overall < 45) eligibility = "uncertain";
  if (penalties.length && eligibility === "likely_eligible") eligibility = "uncertain";

  let recommendedAction: RecommendedAction;
  if (eligibility === "likely_ineligible") recommendedAction = "skip";
  else if (overall >= 75 && confidence >= 0.6) recommendedAction = "strong_apply";
  else if (overall >= 55) recommendedAction = "apply";
  else recommendedAction = "review_carefully";

  const questionsForCandidate: string[] = [];
  if (!profile.workAuthorization) questionsForCandidate.push("What is your work authorization for this location?");
  if (missing.length) questionsForCandidate.push("Do you have any of the missing requirements not yet in your profile?");

  return {
    overallScore: overall,
    confidence,
    eligibility,
    breakdown,
    matchedRequirements: matched.slice(0, 20),
    missingRequirements: Array.from(new Set(missing)).slice(0, 12),
    transferableStrengths: evidence.slice(0, 5).map((e) => e.text.slice(0, 100)),
    questionsForCandidate,
    recommendedAction,
    penaltiesApplied: penalties,
  };
}
