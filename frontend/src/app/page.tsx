import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { LandingHero } from "@/components/landing/LandingHero";
import { FeatureGrid, type Feature } from "@/components/landing/FeatureGrid";
import { Reveal } from "@/components/hud/Reveal";
import { HoloFrame } from "@/components/hud/HoloFrame";
import { LogoMark } from "@/components/layout/LogoMark";
import { AppStartRedirect } from "@/components/landing/AppStartRedirect";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "The Third Eye - Your Personal AI Operating System",
  description:
    "Tasks buried in email and chat, notes you can't find, answers stuck in your own documents. The Third Eye is a private personal AI operating system that pulls it all into one workspace and acts on it for you - capturing tasks and notes, searching your knowledge, and tracking goals and finances.",
  path: "/",
});

const FEATURES: Feature[] = [
  {
    tag: "// assistant",
    title: "AI Assistant",
    body: "Chat or talk with an assistant that searches the web and your own data, then acts - creating tasks, notes, reminders and studio assets for you.",
  },
  {
    tag: "// tasks",
    title: "Tasks & Notes",
    body: "Capture to-dos with priorities and due dates, keep searchable notes, and turn conversations into tracked items.",
  },
  {
    tag: "// knowledge",
    title: "Knowledge",
    body: "Upload your documents and ask questions in plain language. Answers cite the passages they came from.",
  },
  {
    tag: "// studio",
    title: "Studio",
    body: "Landing pages, decks, mailers, social posts, reports and plans from a short brief, ready to copy or download.",
  },
  {
    tag: "// music & video",
    title: "Music, Video & Book Studios",
    body: "Write and sing a song, cut it into a lyric video, or draft a book chapter by chapter.",
  },
  {
    tag: "// job agent",
    title: "Job Agent",
    body: "Paste a role and get a resume and cover letter tailored to it, from your own profile.",
  },
  {
    tag: "// life log",
    title: "Life Log",
    body: "Record your day into a transcript and timeline, open any day on a calendar, and keep a diary.",
  },
  {
    tag: "// goals",
    title: "Goals & Finance",
    body: "Track goals over time and get a clear overview of your money, with calculators built in.",
  },
  {
    tag: "// everywhere",
    title: "Web, iPhone & Android",
    body: "One account across the web and the native apps. Everything you generate shows up in Generations on each.",
  },
];

const FLOW = [
  {
    step: "01",
    title: "Sign in with Google",
    body: "Your name and email only. Mail and calendar stay off until you connect them yourself.",
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
      <AppStartRedirect />
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-accent-blue/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-accent-violet/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5">
        <header className="flex items-center justify-between py-5">
          <Link href="/" className="flex items-center gap-3" aria-label="The Third Eye home">
            <LogoMark size={36} />

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
                  address, for authentication only. Anything you create in the app - including
                  tasks, notes, and documents - is stored so it remains available across your
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
                  Get started
                  <span aria-hidden>→</span>
                </Link>
              </HoloFrame>
            </section>
          </Reveal>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
