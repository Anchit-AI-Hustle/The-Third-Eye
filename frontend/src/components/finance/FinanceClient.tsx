"use client";

import { TrendingUp, TrendingDown, DollarSign, PieChart, CreditCard, ArrowUpRight, ArrowDownRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const MOCK_TRANSACTIONS = [
  { id: "1", label: "Salary Deposit", category: "Income", amount: 8500, type: "credit", date: "May 21" },
  { id: "2", label: "AWS Cloud Services", category: "Infrastructure", amount: 312, type: "debit", date: "May 20" },
  { id: "3", label: "Anthropic API", category: "AI Services", amount: 89, type: "debit", date: "May 19" },
  { id: "4", label: "Vercel Pro", category: "Infrastructure", amount: 20, type: "debit", date: "May 18" },
  { id: "5", label: "Freelance — Design", category: "Income", amount: 1200, type: "credit", date: "May 17" },
  { id: "6", label: "GitHub Copilot", category: "Tools", amount: 19, type: "debit", date: "May 16" },
];

export function FinanceClient() {
  return (
    <div className="space-y-6 relative">
      {/* Coming soon overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-start pt-24 pointer-events-none">
        <div className="bg-background-elevated/80 backdrop-blur-sm border border-border-default rounded-card px-8 py-6 text-center pointer-events-auto">
          <Lock size={20} className="mx-auto text-accent-violet mb-3" />
          <p className="text-text-primary font-semibold text-sm mb-1">Finance Module — Coming Soon</p>
          <p className="text-text-muted text-xs max-w-xs">
            Connect your accounts, track spending, and let JARVIS surface insights automatically. Phase 2 feature.
          </p>
        </div>
      </div>

      {/* Blurred content preview */}
      <div className="blur-sm pointer-events-none select-none">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Net Worth" value="$142,800" change={+3.2} icon={<DollarSign size={15} />} color="blue" />
          <SummaryCard label="Monthly Income" value="$9,700" change={+12.5} icon={<TrendingUp size={15} />} color="green" />
          <SummaryCard label="Monthly Spend" value="$3,420" change={-4.1} icon={<TrendingDown size={15} />} color="red" />
          <SummaryCard label="Savings Rate" value="64.7%" change={+2.3} icon={<PieChart size={15} />} color="violet" />
        </div>

        {/* Transactions */}
        <div className="bg-background-surface border border-border-default rounded-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Recent Transactions</h2>
            <span className="text-text-muted text-xs font-mono">{MOCK_TRANSACTIONS.length} this month</span>
          </div>
          <ul className="divide-y divide-border-default">
            {MOCK_TRANSACTIONS.map((tx) => (
              <li key={tx.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-none",
                  tx.type === "credit" ? "bg-success/10" : "bg-accent-red/10"
                )}>
                  {tx.type === "credit"
                    ? <ArrowDownRight size={14} className="text-success" />
                    : <ArrowUpRight size={14} className="text-accent-red" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{tx.label}</p>
                  <p className="text-xs text-text-muted">{tx.category}</p>
                </div>
                <span className={cn(
                  "text-sm font-mono font-medium flex-none",
                  tx.type === "credit" ? "text-success" : "text-text-primary"
                )}>
                  {tx.type === "credit" ? "+" : "-"}${tx.amount.toLocaleString()}
                </span>
                <span className="text-text-muted text-xs flex-none">{tx.date}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Budget breakdown */}
        <div className="bg-background-surface border border-border-default rounded-card px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Budget Breakdown</h2>
          <div className="space-y-3">
            {[
              { label: "Infrastructure", spent: 332, budget: 500, color: "bg-accent-blue" },
              { label: "AI Services", spent: 89, budget: 200, color: "bg-accent-violet" },
              { label: "Tools & Software", spent: 159, budget: 300, color: "bg-warning" },
              { label: "Marketing", spent: 0, budget: 400, color: "bg-accent-red" },
            ].map(({ label, spent, budget, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-text-secondary">{label}</span>
                  <span className="text-text-muted font-mono">${spent} / ${budget}</span>
                </div>
                <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", color)}
                    style={{ width: `${Math.min((spent / budget) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Credit cards placeholder */}
        <div className="bg-background-surface border border-border-default rounded-card px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Connected Accounts</h2>
          <div className="flex gap-3">
            {["Chase Sapphire", "Mercury Business"].map((name) => (
              <div key={name} className="border border-border-default rounded-card px-4 py-3 flex items-center gap-3 bg-background-elevated">
                <CreditCard size={16} className="text-text-muted" />
                <span className="text-text-secondary text-sm">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label, value, change, icon, color,
}: { label: string; value: string; change: number; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-accent-blue", green: "text-success", red: "text-accent-red", violet: "text-accent-violet",
  };
  return (
    <div className="bg-background-surface border border-border-default rounded-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="p-1.5 bg-background-elevated rounded-input text-text-muted">{icon}</div>
        <span className={cn("text-xs font-mono", change >= 0 ? "text-success" : "text-accent-red")}>
          {change >= 0 ? "+" : ""}{change}%
        </span>
      </div>
      <p className={cn("font-display text-xl font-bold mb-0.5", colorMap[color])}>{value}</p>
      <p className="text-text-muted text-xs">{label}</p>
    </div>
  );
}
