import { ActivityClient } from "@/components/activity/ActivityClient";

export const metadata = { title: "Agent Activity — The Third Eye" };

export default function ActivityPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-28 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Agent Safety</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Agent Activity</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Kill switch · append-only audit log of every action the assistant takes
        </p>
      </div>
      <ActivityClient />
    </div>
  );
}
