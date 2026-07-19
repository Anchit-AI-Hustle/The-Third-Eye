// Canonical Job Agent domain types. Framework-free so both server routes and
// client components import the same source of truth.

// ── Job search + normalized listings ────────────────────────────────────────

export type RemotePreference = "remote" | "hybrid" | "onsite" | "any";
export type DatePosted = "day" | "week" | "month" | "any";

export interface JobSearchInput {
  query: string;
  location?: string;
  remotePreference?: RemotePreference;
  employmentTypes?: string[];
  experienceLevels?: string[];
  datePosted?: DatePosted;
  salaryMin?: number;
  salaryCurrency?: string;
  visaSponsorship?: boolean;
  page?: number;
  limit?: number;
  sources?: string[]; // adapter ids to include; empty = all configured
}

export interface NormalizedJob {
  id: string; // stable app-side id derived from canonical key
  source: string;
  sourceJobId?: string;
  title: string;
  company: string;
  companyLogoUrl?: string;
  locationText?: string;
  remoteType?: string;
  employmentType?: string;
  seniority?: string;
  descriptionHtml?: string; // sanitized
  descriptionText: string;
  requirements?: string[];
  skills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryInterval?: string;
  salaryOriginalText?: string;
  visaSponsorship?: boolean;
  publishedAt?: string;
  expiresAt?: string;
  applyUrl: string;
  canonicalUrl: string;
  sourceUrl: string;
  sourceAttribution: string;
  fetchedAt: string;
  contentHash: string;
  rawMetadata?: Record<string, unknown>;
}

export type SourceStatus =
  | { id: string; displayName: string; state: "complete"; count: number; latencyMs: number }
  | { id: string; displayName: string; state: "external-search"; url: string }
  | { id: string; displayName: string; state: "unavailable" | "timed_out" | "unconfigured"; message?: string };

export interface JobSearchResult {
  jobs: NormalizedJob[];
  sources: SourceStatus[];
  fetchedAt: string;
}

// ── Candidate profile + fact vault ──────────────────────────────────────────

export type FactSensitivity = "normal" | "sensitive" | "protected";
export type FactVerification = "unverified" | "verified" | "corrected" | "rejected";

export interface CandidateFact {
  id: string;
  factType: string; // e.g. "skill" | "experience" | "education" | "summary" | "link"
  value: unknown; // normalized value (string | object)
  originalText?: string;
  sourceDocumentId?: string;
  confidence: number; // 0..1
  verified: FactVerification;
  sensitivity: FactSensitivity;
  updatedAt: string;
}

export interface CareerProfile {
  fullName?: string;
  preferredName?: string;
  headline?: string;
  email?: string;
  phone?: string;
  city?: string;
  region?: string;
  country?: string;
  portfolioUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  otherLinks?: { label: string; url: string }[];
  summary?: string;
  targetRoles?: string[];
  targetIndustries?: string[];
  preferredLocations?: string[];
  remotePreference?: RemotePreference;
  employmentTypes?: string[];
  salaryExpectation?: { min?: number; currency?: string; interval?: string };
  workAuthorization?: string; // e.g. "Indian citizen; authorized to work in India"
  needsSponsorship?: boolean;
  noticePeriod?: string;
  yearsExperience?: number;
  exclusions?: string[];
}

// ── Match analysis ──────────────────────────────────────────────────────────

export type Eligibility = "eligible" | "likely_eligible" | "uncertain" | "likely_ineligible";
export type RecommendedAction = "strong_apply" | "apply" | "review_carefully" | "skip";

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number; // 0..1
  score: number; // 0..100
}

export interface MatchAnalysis {
  overallScore: number; // 0..100
  confidence: number; // 0..1
  eligibility: Eligibility;
  breakdown: ScoreComponent[];
  matchedRequirements: { requirement: string; candidateFactIds: string[]; explanation: string }[];
  missingRequirements: string[];
  transferableStrengths: string[];
  questionsForCandidate: string[];
  recommendedAction: RecommendedAction;
  penaltiesApplied: string[];
}

// ── Resume / cover-letter canonical document model ───────────────────────────

export interface ResumeContactBlock {
  fullName: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: { label: string; url: string }[];
}

export interface ResumeBullet {
  text: string;
  sourceFactIds?: string[];
  generated?: boolean;
}

export interface ResumeEntry {
  title?: string; // role / degree / project name
  org?: string; // company / school
  location?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  bullets?: ResumeBullet[];
  sourceFactIds?: string[];
}

export interface ResumeSection {
  id: string;
  label: string;
  kind:
    | "summary"
    | "skills"
    | "experience"
    | "projects"
    | "education"
    | "certifications"
    | "awards"
    | "publications"
    | "languages"
    | "volunteering"
    | "custom";
  visible: boolean;
  // For summary: text. For skills/languages: string[]. Otherwise: entries.
  text?: string;
  items?: string[];
  entries?: ResumeEntry[];
  sourceFactIds?: string[];
}

export interface ResumeDocument {
  contact: ResumeContactBlock;
  templateId: string; // "classic-ats" | "technical" | "professional" | "executive"
  sections: ResumeSection[];
  includedKeywords?: string[];
  unsupportedKeywords?: string[];
  warnings?: string[];
  omittedFacts?: { factId: string; reason: string }[];
}

export interface CoverLetterParagraph {
  text: string;
  sourceFactIds?: string[];
  companySourceIds?: string[];
}

export interface CoverLetterDocument {
  greeting: string;
  paragraphs: CoverLetterParagraph[];
  closing: string;
  signature?: string;
  warnings?: string[];
}

// ── Screening answers ───────────────────────────────────────────────────────

export interface ScreeningAnswer {
  question: string;
  answer: string;
  sourceFactIds: string[];
  confidence: number;
  requiresUserInput: boolean;
  isSensitive: boolean;
  isLegalAttestation: boolean;
  warning?: string;
}

// ── Application state machine ────────────────────────────────────────────────

export type ApplicationStatus =
  | "discovered"
  | "saved"
  | "preparing"
  | "needs_review"
  | "ready_to_apply"
  | "applying"
  | "submitted"
  | "recruiter_contact"
  | "assessment"
  | "interview"
  | "final_interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "archived"
  | "blocked";

export type KitStatus =
  | "queued"
  | "analyzing"
  | "needs_information"
  | "generating_resume"
  | "generating_cover_letter"
  | "validating"
  | "needs_review"
  | "approved"
  | "preparing_application"
  | "form_filling"
  | "blocked"
  | "ready_to_submit"
  | "submitted"
  | "failed"
  | "cancelled";

export interface JobAnalysis {
  normalizedTitle: string;
  company: string;
  seniority?: string;
  responsibilities: string[];
  mustHaveRequirements: string[];
  niceToHaveRequirements: string[];
  keywords: string[];
  locationRequirements: string[];
  workAuthorizationRequirements: string[];
  applicationInstructions: string[];
  risks: string[];
}

export interface ApplicationKit {
  job: NormalizedJob;
  analysis: JobAnalysis;
  match: MatchAnalysis;
  resume: ResumeDocument;
  coverLetter: CoverLetterDocument;
  screeningAnswers: ScreeningAnswer[];
  warnings: string[];
  needsInformation: string[];
  status: KitStatus;
  generatedAt: string;
  provider?: string;
}
