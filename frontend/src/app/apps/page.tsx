import { AppHub } from "@/components/apps/AppHub";

export const metadata = { title: "Apps — The Third Eye" };

export default function AppsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#4FC3F7]">// Life OS</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Apps</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Everything for the day — self-built apps (data on your device) + one-tap links to the apps you use
        </p>
      </div>
      <AppHub />
    </div>
  );
}
