// web/components/ui.tsx
// Base design-system primitives ported from the prototype's visual language
// (dark surfaces, lime accent, JetBrains Mono labels). Pure presentational components.
import * as React from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary";
  block?: boolean;
};

export function Button({ variant = "default", block, className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[9px] border px-[18px] py-[11px]",
        "font-mono text-[12px] font-bold uppercase tracking-[0.06em] transition-opacity",
        "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary"
          ? "border-kolab-lime bg-kolab-lime text-kolab-base"
          : "border-kolab-line bg-kolab-surface text-kolab-ink",
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-[14px] border border-kolab-line bg-kolab-surface", className)}
      {...props}
    />
  );
}

type PillProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "ok" | "warn" | "lock";
};
export function Pill({ tone = "default", className, ...props }: PillProps) {
  const tones = {
    default: "border-kolab-line text-kolab-ink",
    ok: "border-kolab-lime/40 text-kolab-lime",
    warn: "border-kolab-gold/40 text-kolab-gold",
    lock: "border-kolab-line text-kolab-faint",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "font-mono text-[10px] font-bold uppercase tracking-[0.06em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-kolab-lime",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cx(
        "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-kolab-muted",
        className,
      )}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          "w-full rounded-[10px] border border-kolab-line bg-kolab-surface2 px-[13px] py-[11px]",
          "font-sans text-[14px] text-kolab-ink outline-none focus:border-kolab-lime",
          className,
        )}
        {...props}
      />
    );
  },
);
