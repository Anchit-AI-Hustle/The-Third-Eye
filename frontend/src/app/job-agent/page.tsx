import { JobAgentHome } from "@/components/jobAgent/JobAgentHome";

export const metadata = { title: "Job Agent — The Third Eye" };

export default function JobAgentPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#4FC3F7]">// Career Ops</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Job Agent</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Search, match, tailor, and track applications — truth-constrained, private to you
        </p>
      </div>
      <JobAgentHome />
    </div>
  );
}
