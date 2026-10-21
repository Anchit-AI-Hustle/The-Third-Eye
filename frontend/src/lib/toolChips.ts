/** One chip per tool, counting repeats: a 22-call GitHub sweep is "github ×22", not 22 chips. */
export function groupToolLabels(labels: string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count }));
}
