// The HUD behind every page: two instrument dials with tick rings turning in
// opposite directions and a radar sweep, a hex field, a scan beam crossing the
// screen and drifting data motes. SVG + CSS (transform and opacity only),
// styles in globals.css under "Ambient HUD".

const MOTES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${-((i * 1.7) % 12)}s`,
  duration: `${10 + ((i * 5) % 8)}s`,
}));

function Dial({ className }: { className: string }) {
  return (
    <svg className={`hud-dial ${className}`} viewBox="0 0 200 200" aria-hidden="true">
      <g className="hud-dial-outer">
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.6" />
        <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="3" strokeDasharray="0.8 4.02" />
        <path d="M100 4 A96 96 0 0 1 183 52" fill="none" stroke="#FFB547" strokeOpacity="0.85" strokeWidth="2" />
      </g>
      <g className="hud-dial-inner">
        <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="38 8 6 8" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="6" strokeDasharray="1 3" />
      </g>
      <g className="hud-dial-sweep">
        <path d="M100 100 L100 46 A54 54 0 0 1 146.8 73 Z" fill="url(#hudSweep)" />
      </g>
      <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="5" fill="currentColor" fillOpacity="0.8" />
      <defs>
        <linearGradient id="hudSweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4FC3F7" stopOpacity="0.45" />
          <stop offset="1" stopColor="#4FC3F7" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function AmbientScene() {
  return (
    <div className="ambient-scene" aria-hidden="true">
      <div className="ambient-glow" />
      <div className="ambient-hex" />
      <Dial className="hud-dial-a" />
      <Dial className="hud-dial-b" />
      <div className="ambient-beam" />
      {MOTES.map((m, i) => (
        <span key={i} className="ambient-spark" style={{ left: m.left, animationDelay: m.delay, animationDuration: m.duration }} />
      ))}
    </div>
  );
}
