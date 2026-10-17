// The backdrop behind every page: a slowly breathing glow and one faint
// instrument ring turning at the edge of the screen. SVG + CSS (transform and
// opacity only), styles in globals.css under "Ambient backdrop".

export function AmbientScene() {
  return (
    <div className="ambient-scene" aria-hidden="true">
      <div className="ambient-glow" />
      <svg className="hud-dial" viewBox="0 0 200 200">
        <g className="hud-dial-outer">
          <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.5" />
          <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="0.5 4.3" />
        </g>
        <g className="hud-dial-inner">
          <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.6" strokeDasharray="40 10" />
        </g>
      </svg>
    </div>
  );
}
