import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingReveal } from "@/components/landing/LandingReveal";

export const metadata = {
  title: "The Third Eye — Your Personal AI Operating System",
  description:
    "The Third Eye is a private, self-hosted personal AI operating system. One workspace where an AI assistant helps you capture tasks and notes, search your own knowledge, track goals and finances, and stay on top of reminders.",
};

const FEATURES = [
  {
    title: "AI Assistant",
    body: "Chat with an assistant that can search the web, look things up in your own data, and take actions — creating tasks, notes, and reminders on your behalf.",
  },
  {
    title: "Tasks",
    body: "Capture to-dos with priorities and due dates, and let the assistant turn conversations into tracked, actionable items.",
  },
  {
    title: "Knowledge",
    body: "Upload your documents and ask questions in plain language. Answers cite the passages they came from, powered by semantic search over your files.",
  },
  {
    title: "Notes",
    body: "Quickly capture thoughts and meeting notes — organized, searchable, and always private to your account.",
  },
  {
    title: "Reminders & Daily Plan",
    body: "Get nudged about what's due and receive a morning plan so nothing important slips through the cracks.",
  },
  {
    title: "Goals & Finance",
    body: "Track your goals over time and get a clear overview of your finances, all in one place.",
  },
];

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background-base text-text-primary">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-accent-blue/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-accent-violet/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5">
        <header className="flex items-center justify-between py-5">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="The Third Eye home"
          >
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-accent-blue/20 bg-accent-blue/10">
              <img
                src="/logo.png"
                alt=""
                className="h-full w-full object-cover"
              />
            </div>

            <span className="font-display font-bold tracking-tight">
              The Third Eye
            </span>
          </Link>

          <Link
            href="/auth/signin"
            className="flex h-10 items-center justify-center rounded-input bg-accent-blue px-4 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-blue/90 active:scale-[0.98]"
          >
            Sign in
          </Link>
        </header>

        <main>
          {/* Three.js + GSAP hero */}
          <LandingHero />

          <LandingReveal>
            <section className="pb-16">
              <h2
                data-reveal
                className="mb-8 text-center font-display text-2xl font-semibold"
              >
                What you can do with The Third Eye
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURES.map((feature) => (
                  <article
                    key={feature.title}
                    data-reveal
                    className="rounded-card border border-border-default bg-background-surface p-5 text-left transition-colors hover:border-[#4FC3F7]/30"
                  >
                    <h3 className="mb-2 font-medium text-text-primary">
                      {feature.title}
                    </h3>

                    <p className="text-sm leading-relaxed text-text-secondary">
                      {feature.body}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </LandingReveal>

          <section className="pb-16">
            <div className="mx-auto max-w-3xl rounded-card border border-border-default bg-background-surface p-6">
              <h2 className="mb-3 font-display text-lg font-semibold">
                Your data and why we ask for it
              </h2>

              <p className="text-sm leading-relaxed text-text-secondary">
                The Third Eye uses your Google account solely to sign you in and
                identify your private workspace. We request your basic profile,
                including your name and email address, for authentication only.
                Anything you create in the app — including tasks, notes, and
                documents — is stored so it remains available across your
                devices and is visible only to you. We never sell your data or
                share it with third parties for advertising. Additional access
                for optional integrations is requested explicitly and used only
                for features you enable. Full details are available in our{" "}
                <Link
                  href="/privacy_policy"
                  className="text-accent-blue hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </section>
        </main>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-border-default py-8 text-xs text-text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} The Third Eye</span>

          <nav
            className="flex items-center gap-4 font-mono"
            aria-label="Legal and product links"
          >
            <Link
              href="/capabilities"
              className="transition-colors hover:text-text-secondary"
            >
              Capabilities
            </Link>

            <span className="text-border-default" aria-hidden="true">
              ·
            </span>

            <Link
              href="/privacy_policy"
              className="transition-colors hover:text-text-secondary"
            >
              Privacy Policy
            </Link>

            <span className="text-border-default" aria-hidden="true">
              ·
            </span>

            <Link
              href="/terms_of_service"
              className="transition-colors hover:text-text-secondary"
            >
              Terms of Service
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}