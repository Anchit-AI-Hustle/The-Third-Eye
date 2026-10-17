// A live telemetry line: two waveforms scrolling at different speeds. Each SVG
// holds the same wave twice, so scrolling by half its width loops seamlessly.

function wave(amp: number, period: number, phase: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= 800; x += 4) {
    const y = 20 + amp * Math.sin((x / period) * Math.PI * 2 + phase) * Math.sin((x / 400) * Math.PI);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

const MAIN = wave(12, 100, 0);
const ECHO = wave(7, 200, 1.3);

export function SignalTrace({ className }: { className?: string }) {
  return (
    <div className={`signal-trace ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 800 40" preserveAspectRatio="none">
        <path d={MAIN} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg viewBox="0 0 800 40" preserveAspectRatio="none">
        <path d={ECHO} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
