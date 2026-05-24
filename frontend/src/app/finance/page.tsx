import { FinanceClient } from "@/components/finance/FinanceClient";

export const metadata = { title: "Finance — The Third Eye" };

export default function FinancePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Financial Intelligence</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Finance</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">Financial analytics and intelligence dashboard</p>
      </div>
      <FinanceClient />
    </div>
  );
}
