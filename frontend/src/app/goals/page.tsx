import { GoalsClient } from "@/components/goals/GoalsClient";

export const metadata = { title: "Objectives — The Third Eye" };

export default function GoalsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Objective Tracker</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Goals</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">Track what matters · Your AI monitors your progress</p>
      </div>
      <GoalsClient />
    </div>
  );
}
