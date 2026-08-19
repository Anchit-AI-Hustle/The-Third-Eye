import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import "../kolab/studio/kolab-studio.css";

// Public creator storefronts (/kolab-store/[handle]) render OUTSIDE the NextAuth-gated
// /kolab/studio tree — a follower opening a shared link is never asked to sign in to The
// Third Eye — but still want Kolab's own visual language, so the theme + fonts are loaded
// here independently.
const kolabArchivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-kolab-archivo",
  display: "swap",
});
const kolabInter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-kolab-inter",
  display: "swap",
});
const kolabMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-kolab-jetbrains",
  display: "swap",
});

export default function KolabStoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`kolab-theme min-h-screen ${kolabArchivo.variable} ${kolabInter.variable} ${kolabMono.variable}`}>
      <div className="kolab-aurora" aria-hidden="true">
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      {children}
    </div>
  );
}
