// web/components/Logo.tsx
export function Logo({ size = 20 }: { size?: number }) {
  const mark = Math.round(size * 1.9);
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid place-items-center rounded-[11px] bg-kolab-lime font-kolab-display font-black text-kolab-base"
        style={{ width: mark, height: mark, fontSize: size }}
      >
        K
      </span>
      <b className="font-kolab-display text-[color:var(--kolab-ink)]" style={{ fontSize: size }}>
        Kolab
      </b>
    </div>
  );
}
