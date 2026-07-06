import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background-base flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-accent-violet/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 overflow-hidden mb-5 shadow-elevated flex items-center justify-center">
          <img
            src="/logo.png"
            alt="The Third Eye"
            className="w-full h-full object-cover"
          />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary tracking-tight">
          The Third Eye
        </h1>
        <p className="text-text-secondary text-sm mt-2">
          Your Personal Intelligence Operating System
        </p>

        <Link
          href="/auth/signin"
          className="mt-8 w-full flex items-center justify-center bg-accent-blue hover:bg-accent-blue/90 text-white rounded-input px-4 h-12 text-sm font-medium transition-all duration-150 active:scale-[0.98]"
        >
          Sign in
        </Link>
      </div>

      <footer className="relative z-10 mt-12 flex items-center justify-center gap-4 text-text-muted text-xs font-mono">
        <Link href="/privacy_policy" className="hover:text-text-secondary transition-colors">
          Privacy Policy
        </Link>
        <span className="text-border-default">·</span>
        <Link href="/terms_of_service" className="hover:text-text-secondary transition-colors">
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
