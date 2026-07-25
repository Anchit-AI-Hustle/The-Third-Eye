import { OnlineAgents } from "@/components/systems/OnlineAgents";

export const metadata = { title: "Online Agents — The Third Eye" };

export default function AgentsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#34D399]">// Systems status</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Online Agents</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Every agent &amp; subsystem — live status, purpose, and a jump to its tool
        </p>
      </div>
      <OnlineAgents />
    </div>
  );
}
