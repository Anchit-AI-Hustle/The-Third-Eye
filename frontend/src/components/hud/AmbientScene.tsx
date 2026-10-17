// The moving backdrop behind every page: drifting light, a 3D grid floor
// running toward the viewer, a gyroscope ring and rising sparks. CSS only
// (transform + opacity), styles in globals.css.

const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${-((i * 1.7) % 12)}s`,
  duration: `${9 + ((i * 5) % 8)}s`,
  size: `${2 + (i % 3)}px`,
}));

export function AmbientScene() {
  return (
    <div className="ambient-scene" aria-hidden="true">
      <div className="ambient-orb ambient-orb-a" />
      <div className="ambient-orb ambient-orb-b" />
      <div className="ambient-orb ambient-orb-c" />
      <div className="ambient-floor"><div className="ambient-grid" /></div>
      <div className="ambient-gyro"><span /><span /><span /></div>
      {SPARKS.map((s, i) => (
        <span key={i} className="ambient-spark" style={{ left: s.left, animationDelay: s.delay, animationDuration: s.duration, width: s.size, height: s.size }} />
      ))}
    </div>
  );
}
