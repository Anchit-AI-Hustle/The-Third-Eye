import { cn } from "@/lib/utils";

type Corner = "tl" | "tr" | "bl" | "br";

const ALL_CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

export type HoloFrameProps = {
  children: React.ReactNode;
  /** Which brackets to draw. Defaults to all four. */
  corners?: Corner[];
  /** Monospace HUD caption seated on the top rule. */
  label?: string;
  /** Draws the hairline rule between the top brackets. */
  rule?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">;

const SIZE: Record<NonNullable<HoloFrameProps["size"]>, string> = {
  sm: "12px",
  md: "18px",
  lg: "28px",
};

// Instrument-panel bracket frame — the app's signature "targeting reticle"
// container. Corners extend and brighten on hover/focus-within, so the frame
// reads as locking on to whatever the user is pointing at.
//
// Superseded the `.hud-frame` utility, which could only ever draw two corners
// (it was built from ::before/::after) and had no label or focus affordance.
export function HoloFrame({
  children,
  corners = ALL_CORNERS,
  label,
  rule = false,
  size = "md",
  className,
  style,
  ...rest
}: HoloFrameProps) {
  return (
    <div
      className={cn("holo-frame", className)}
      style={{ ["--frame-size" as string]: SIZE[size], ...style }}
      {...rest}
    >
      {corners.map((c) => (
        <span key={c} aria-hidden className={`holo-frame-corner corner-${c}`} />
      ))}

      {rule && <span aria-hidden className="holo-frame-rule" />}

      {label && (
        <span className="hud-label absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background-base px-2">
          {label}
        </span>
      )}

      {children}
    </div>
  );
}
