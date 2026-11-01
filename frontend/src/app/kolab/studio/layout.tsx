import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import localFont from "next/font/local";
import { authOptions } from "@/lib/auth";
import { MainLayout } from "@/components/layout/MainLayout";
import "./kolab-studio.css";

// Kolab Studio's own faces (Archivo / Inter / JetBrains Mono, OFL), kept in the repo so the
// build never fetches from Google Fonts. Loaded only in this subtree.
const kolabArchivo = localFont({
  src: "./fonts/archivo-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-kolab-archivo",
  display: "swap",
});
const kolabInter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-kolab-inter",
  display: "swap",
});
const kolabMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-kolab-jetbrains",
  display: "swap",
});

export const metadata = { title: "Kolab Studio - The Third Eye" };

// The gate: the app's own NextAuth session (matches every other protected route — see
// middleware.ts matcher). Kolab Studio has no sign-in of its own; `(app)/layout.tsx` and
// `onboarding/page.tsx` resolve the user's orgs on top of this session. Its Aadhaar-KYC /
// subscription entitlement model (CLAUDE.md guardrail #4 in the Kolab repo) is its own and
// must not be conflated with this app's billing.
export default async function KolabStudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <MainLayout>
      <div className={`kolab-theme ${kolabArchivo.variable} ${kolabInter.variable} ${kolabMono.variable}`}>
        <div className="kolab-aurora" aria-hidden="true">
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
        </div>
        {children}
      </div>
    </MainLayout>
  );
}
