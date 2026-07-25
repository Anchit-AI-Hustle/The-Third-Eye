import { ApplicationsPanel } from "@/components/jobAgent/ApplicationsPanel";

export const metadata = { title: "Applications — Job Agent" };

export default function ApplicationsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#4FC3F7]">// Pipeline</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Applications</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Track every application, status, and follow-up in one place
        </p>
      </div>
      <ApplicationsPanel />
    </div>
  );
}
