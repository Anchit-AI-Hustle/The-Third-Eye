import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "../kolab/studio/kolab-studio.css";

// Reuse the self-hosted app fonts so storefront builds do not fetch Google Fonts.
export default function KolabStoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`kolab-theme min-h-screen ${GeistSans.variable} ${GeistMono.variable}`}>
      <div className="kolab-aurora" aria-hidden="true">
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      {children}
    </div>
  );
}
