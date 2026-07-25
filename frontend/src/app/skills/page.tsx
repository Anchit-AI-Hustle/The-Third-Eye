import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SkillsClient } from "@/components/skills/SkillsClient";

export const metadata = { title: "Skills — The Third Eye" };

export default async function SkillsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#4FC3F7]">// Automations</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Skills</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Saved multi-step workflows your assistant runs on command
        </p>
      </div>
      <SkillsClient />
    </div>
  );
}
