import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const FEATURES = [
  {
    title: "Conversational AI assistant",
    body: "Streaming voice and text dialog with distinct personalities. Ask questions, run calculations, translate, and get instant answers.",
  },
  {
    title: "Knowledge base & document Q&A",
    body: "Upload PDFs and documents, then chat with them. Retrieval-augmented search surfaces the passages that matter.",
  },
  {
    title: "Tasks, notes & reminders",
    body: "Capture notes by voice or text, track tasks with priorities and due dates, and set browser reminders — hands-free.",
  },
  {
    title: "Live web, weather & places",
    body: "Real-time web search, local weather and forecasts, nearby places, news briefings, and live stock or crypto quotes.",
  },
  {
    title: "Parallel multi-agent research",
    body: "Sub-agents tackle distinct angles of a question in parallel and synthesize a single strategic answer with confidence.",
  },
  {
    title: "Your data, your control",
    body: "Every account's data is isolated to that user, and you can review or delete your documents and history whenever you like.",
  },
];

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background-base text-text-primary relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-accent-violet/5 rounded-full blur-3xl" />
      </div>

      <header className="relative z-10 mx-auto max-w-5xl flex items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-blue/10 border border-accent-blue/20 overflow-hidden flex items-center justify-center">
            <img src="/logo.png" alt="The Third Eye" className="w-full h-full object-cover" />
          </div>
          <span className="font-display font-semibold tracking-tight">The Third Eye</span>
        </div>
        <Link
          href="/auth/signin"
          className="flex items-center justify-center bg-accent-blue hover:bg-accent-blue/90 text-white rounded-input px-4 h-10 text-sm font-medium transition-all duration-150 active:scale-[0.98]"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4">
        <section className="flex flex-col items-center text-center pt-14 pb-16 md:pt-20 md:pb-20">
          <div className="w-20 h-20 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 overflow-hidden mb-6 shadow-elevated flex items-center justify-center">
            <img src="/logo.png" alt="The Third Eye" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight max-w-2xl">
            Your Personal Intelligence Operating System
          </h1>
          <p className="text-text-secondary text-base md:text-lg mt-4 max-w-xl">
            The Third Eye is an AI assistant that unifies conversation, knowledge, tasks, and
            real-time information into one private, voice-first workspace.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <Link
              href="/auth/signin"
              className="flex items-center justify-center bg-accent-blue hover:bg-accent-blue/90 text-white rounded-input px-6 h-12 text-sm font-medium transition-all duration-150 active:scale-[0.98]"
            >
              Get started
            </Link>
            <Link
              href="/capabilities"
              className="flex items-center justify-center border border-border-default hover:border-accent-blue/40 text-text-primary rounded-input px-6 h-12 text-sm font-medium transition-colors"
            >
              Explore capabilities
            </Link>
          </div>
        </section>

        <section className="pb-16 md:pb-24">
          <h2 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-text-muted mb-8">
            What it does
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border-default bg-background-surface/30 p-5 text-left"
              >
                <h3 className="font-medium text-text-primary">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed mt-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto max-w-5xl px-4 py-8 border-t border-border-default flex flex-col sm:flex-row items-center justify-between gap-4 text-text-muted text-xs font-mono">
        <span>© {new Date().getFullYear()} The Third Eye</span>
        <div className="flex items-center gap-4">
          <Link href="/capabilities" className="hover:text-text-secondary transition-colors">
            Capabilities
          </Link>
          <Link href="/privacy_policy" className="hover:text-text-secondary transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms_of_service" className="hover:text-text-secondary transition-colors">
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  );
}
