// The JARVIS backdrop behind every page: an instrument ring with a radar sweep
// turning in the corner, a perspective grid floor drifting toward the viewer,
// a slow scan line and a few rising data motes. Cyan line work only, kept
// faint so content leads. SVG + CSS (transform and opacity only), styles in
// globals.css under "Ambient backdrop".

const MOTES = Array.from({ length: 10 }, (_, i) => ({
  left: `${8 + ((i * 37) % 86)}%`,
  delay: `${-((i * 2.3) % 18)}s`,
  duration: `${16 + ((i * 5) % 10)}s`,
}));

export function AmbientScene() {
  return (
    <div className="ambient-scene" aria-hidden="true">
      <div className="ambient-glow" />
      <div className="ambient-floor" />
      <svg className="hud-dial" viewBox="0 0 200 200">
        <g className="hud-dial-outer">
          <circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="0.4" />
          <circle cx="100" cy="100" r="93" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" strokeDasharray="0.4 2.52" />
          <circle cx="100" cy="100" r="93" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="0.8 72.2" />
        </g>
        <g className="hud-dial-inner">
          <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.8" strokeDasharray="60 12 8 12" />
          <circle cx="100" cy="100" r="64" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.4" />
        </g>
        <g className="hud-dial-sweep">
          <path d="M100 100 L100 36 A64 64 0 0 1 145.3 54.7 Z" fill="url(#hudSweep)" />
          <line x1="100" y1="100" x2="100" y2="36" stroke="currentColor" strokeOpacity="0.8" strokeWidth="0.6" />
        </g>
        <circle cx="100" cy="100" r="2" fill="currentColor" fillOpacity="0.8" />
        <defs>
          <linearGradient id="hudSweep" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="#4FC3F7" stopOpacity="0.35" />
            <stop offset="1" stopColor="#4FC3F7" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="ambient-scan" />
      {MOTES.map((m, i) => (
        <span key={i} className="ambient-mote" style={{ left: m.left, animationDelay: m.delay, animationDuration: m.duration }} />
      ))}
    </div>
  );
}
