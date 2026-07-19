import { ProfilePanel } from "@/components/jobAgent/ProfilePanel";

export const metadata = { title: "Career Profile — Job Agent" };

export default function JobAgentProfilePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#4FC3F7]">// Fact Vault</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Career Profile</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Import a resume, review extracted facts, and verify what tailoring is allowed to use
        </p>
      </div>
      <ProfilePanel />
    </div>
  );
}
