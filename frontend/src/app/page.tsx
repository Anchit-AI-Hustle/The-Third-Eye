import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { LandingHero } from "@/components/landing/LandingHero";
import { FeatureGrid, type Feature } from "@/components/landing/FeatureGrid";
import { Reveal } from "@/components/hud/Reveal";
import { HoloFrame } from "@/components/hud/HoloFrame";

export const metadata = {
  title: "The Third Eye — Your Personal AI Operating System",
  description:
    "Tasks buried in email and chat, notes you can't find, answers stuck in your own documents. The Third Eye is a private personal AI operating system that pulls it all into one workspace and acts on it for you — capturing tasks and notes, searching your knowledge, and tracking goals and finances.",
};

const FEATURES: Feature[] = [
  {
    tag: "// assistant",
    title: "AI Assistant",
    body: "Chat with an assistant that can search the web, look things up in your own data, and take actions — creating tasks, notes, and reminders on your behalf.",
  },
  {
    tag: "// tasks",
    title: "Tasks",
    body: "Capture to-dos with priorities and due dates, and let the assistant turn conversations into tracked, actionable items.",
  },
  {
    tag: "// knowledge",
    title: "Knowledge",
    body: "Upload your documents and ask questions in plain language. Answers cite the passages they came from, powered by semantic search over your files.",
  },
  {
    tag: "// notes",
    title: "Notes",
    body: "Quickly capture thoughts and meeting notes — organized, searchable, and always private to your account.",
  },
  {
    tag: "// reminders",
    title: "Reminders & Daily Plan",
    body: "Get nudged about what's due and receive a morning plan so nothing important slips through the cracks.",
  },
  {
    tag: "// goals",
    title: "Goals & Finance",
    body: "Track your goals over time and get a clear overview of your finances, all in one place.",
  },
];

const FLOW = [
  {
    step: "01",
    title: "Sign in with Google",
    body: "One click. We ask for your name and email to identify your workspace — nothing else, unless you turn on an integration yourself.",
  },
  {
    step: "02",
    title: "Bring your context",
    body: "Upload documents, capture notes, add tasks. Everything lands in a workspace only you can see.",
  },
  {
    step: "03",
    title: "Ask, and it acts",
    body: "The assistant searches your knowledge, drafts what you need, and writes tasks and reminders back for you.",
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
          <Link href="/" className="flex items-center gap-3" aria-label="The Third Eye home">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-accent-blue/20 bg-accent-blue/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- a 36px
                  mark; next/image would add a request and a wrapper for no
                  measurable gain at this size. */}
              <img src="/logo.png" alt="" className="h-full w-full object-cover" />
            </div>

            <span className="font-display font-bold tracking-tight">The Third Eye</span>
          </Link>

          <Link
            href="/auth/signin"
            className="flex h-10 items-center justify-center rounded-input bg-accent-blue px-4 text-sm font-medium text-background-base transition-all duration-interaction hover:bg-accent-blue/90 active:scale-[0.98]"
          >
            Sign in
          </Link>
        </header>

        <main id="main-content">
          <LandingHero />

          <Reveal>
            <section className="pb-16">
              <h2 data-reveal className="mb-8 text-center font-display text-2xl font-semibold">
                What you can do with The Third Eye
              </h2>

              <FeatureGrid features={FEATURES} />
            </section>

            <section className="pb-16">
              <h2 data-reveal className="mb-8 text-center font-display text-2xl font-semibold">
                How it works
              </h2>

              <ol className="scene-3d grid grid-cols-1 gap-4 sm:grid-cols-3">
                {FLOW.map((f) => (
                  <li key={f.step} data-reveal>
                    <HoloFrame
                      corners={["tl", "br"]}
                      size="sm"
                      className="h-full rounded-card border border-border-default bg-background-surface p-5"
                    >
                      <span className="font-mono text-2xl font-bold text-accent-blue/40">
                        {f.step}
                      </span>

                      <h3 className="mb-2 mt-3 font-medium text-text-primary">{f.title}</h3>

                      <p className="text-sm leading-relaxed text-text-secondary">{f.body}</p>
                    </HoloFrame>
                  </li>
                ))}
              </ol>
            </section>

            <section className="pb-16">
              <div
                data-reveal
                className="mx-auto max-w-3xl rounded-card border border-border-default bg-background-surface p-6"
              >
                <h2 className="mb-3 font-display text-lg font-semibold">
                  Your data and why we ask for it
                </h2>

                <p className="text-sm leading-relaxed text-text-secondary">
                  The Third Eye uses your Google account solely to sign you in and identify your
                  private workspace. We request your basic profile, including your name and email
                  address, for authentication only. Anything you create in the app — including
                  tasks, notes, and documents — is stored so it remains available across your
                  devices and is visible only to you. We never sell your data or share it with third
                  parties for advertising. Additional access for optional integrations is requested
                  explicitly and used only for features you enable. Full details are available in
                  our{" "}
                  <Link href="/privacy_policy" className="text-accent-blue hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </section>

            <section className="pb-20">
              <HoloFrame
                data-reveal
                rule
                label="// begin"
                size="lg"
                className="mx-auto max-w-2xl rounded-card border border-accent-blue/20 bg-background-surface/60 px-6 py-12 text-center"
              >
                <h2 className="font-display text-2xl font-semibold">Ready when you are</h2>

                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
                  Sign in and your workspace is live in seconds. Nothing to install, nothing to
                  configure.
                </p>

                <Link
                  href="/auth/signin"
                  className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-input bg-accent-blue px-7 text-sm font-semibold text-background-base shadow-[0_0_30px_rgba(79,195,247,0.35)] transition-all duration-interaction hover:brightness-110 active:scale-[0.98]"
                >
                  Get started with Google
                  <span aria-hidden>→</span>
                </Link>
              </HoloFrame>
            </section>
          </Reveal>
        </main>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-border-default py-8 text-xs text-text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} The Third Eye</span>

          <nav className="flex items-center gap-4 font-mono" aria-label="Legal and product links">
            <Link href="/capabilities" className="transition-colors hover:text-text-secondary">
              Capabilities
            </Link>

            <span className="text-border-default" aria-hidden="true">
              ·
            </span>

            <Link href="/privacy_policy" className="transition-colors hover:text-text-secondary">
              Privacy Policy
            </Link>

            <span className="text-border-default" aria-hidden="true">
              ·
            </span>

            <Link href="/terms_of_service" className="transition-colors hover:text-text-secondary">
              Terms of Service
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
