import { GenerationsClient } from "@/components/generations/GenerationsClient";

export const metadata = { title: "Generations - The Third Eye" };

export default function GenerationsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-accent-blue">Output log</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Generations</h1>
        <p className="text-text-muted text-sm mt-1">
          Every output across your apps - open any one for the full input &amp; output
        </p>
      </div>
      <GenerationsClient />
    </div>
  );
}
