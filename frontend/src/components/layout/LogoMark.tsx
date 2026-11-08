import Image from "next/image";

// The Third Eye mark: the chrome eye with the "T" iris from the app icon
// (public/icon-512.png), cut from its tile so it sits on any dark surface.
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return <Image src="/logo-mark.png" width={size} height={size} alt="The Third Eye" className={className} priority={size >= 64} />;
}
