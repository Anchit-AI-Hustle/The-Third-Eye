import { JobSearch } from "@/components/jobAgent/JobSearch";

export const metadata = { title: "Job Search — Job Agent" };

export default function JobSearchPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#4FC3F7]">// Unified Search</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Job Search</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          One search across permitted sources · normalized, deduplicated, with transparent match scores
        </p>
      </div>
      <JobSearch />
    </div>
  );
}
