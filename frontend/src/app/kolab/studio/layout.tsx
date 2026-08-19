import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import { authOptions } from "@/lib/auth";
import { MainLayout } from "@/components/layout/MainLayout";
import "./kolab-studio.css";

// Kolab Studio's own faces, ported from the standalone Kolab repo (CLAUDE.md: "Keep the
// existing dark/lime visual language — Archivo / Inter / JetBrains Mono"). Loaded only in this
// subtree so they never affect the rest of the app's font loading.
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

export const metadata = { title: "Kolab Studio — The Third Eye" };

// Outer gate: the app's own NextAuth session (matches every other protected route — see
// middleware.ts matcher). Kolab Studio then runs its OWN session/org resolution on top of
// this, in `(app)/layout.tsx`, `auth/layout.tsx` and `onboarding/layout.tsx` — it has a
// dedicated Supabase project and Aadhaar-KYC/subscription entitlement model (CLAUDE.md
// guardrail #4 in the Kolab repo) that must not be conflated with this app's own auth.
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
