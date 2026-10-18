import { useId } from "react";

// The Third Eye mark: an eye of segmented arcs around an iris holding a "T".
// public/logo.svg is the same drawing on the app-icon tile.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  const g = `te-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" className={className} role="img" aria-label="The Third Eye">
      <defs>
        <linearGradient id={g} x1="10" y1="30" x2="110" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4FC3F7" />
          <stop offset="1" stopColor="#7B5CF0" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${g})`}>
        <path d="M8 60Q60 8 112 60" strokeWidth="6" strokeDasharray="16 5" />
        <path d="M8 60Q60 112 112 60" strokeWidth="6" strokeDasharray="16 5" />
        <path d="M24 60Q60 28 96 60M24 60Q60 92 96 60" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
        <circle cx="60" cy="60" r="21" strokeWidth="4.5" fill="#050505" />
        <circle cx="60" cy="60" r="14.5" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
      </g>
      <path d="M50 51h20v4.5h-7.75V71h-4.5V55.5H50z" fill={`url(#${g})`} />
      <circle cx="68.5" cy="50" r="1.8" fill="#FFFFFF" opacity="0.85" />
    </svg>
  );
}
