import { ProvidersCard } from "@/components/settings/ProvidersCard";

export const metadata = { title: "AI Models - The Third Eye" };

export default function ModelsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-28 lg:pb-28 max-w-2xl">
      <div className="mb-6">
        <span className="hud-label text-[#4FC3F7]">AI Models</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary mt-1">AI Models</h1>
        <p className="text-text-muted text-sm mt-1">AI works out of the box. Connecting your own free account is optional.</p>
      </div>
      <ProvidersCard />
    </div>
  );
}
