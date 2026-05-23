import { FinanceClient } from "@/components/finance/FinanceClient";

export const metadata = { title: "Finance — JARVIS OS" };

export default function FinancePage() {
  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Finance</h1>
        <p className="text-text-secondary text-sm mt-1">
          Your financial intelligence dashboard.
        </p>
      </div>
      <FinanceClient />
    </div>
  );
}
