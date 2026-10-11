import { ConnectorsClient } from "@/components/connectors/ConnectorsClient";

export const metadata = { title: "Connectors — The Third Eye" };

export default function ConnectorsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-28 lg:pb-28 max-w-2xl">
      <div className="mb-6">
        <span className="hud-label text-[#4FC3F7]">// Connectors</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary mt-1">Connectors</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">Give JARVIS your apps and data — it uses them in chat</p>
      </div>
      <ConnectorsClient />
    </div>
  );
}
