import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
    <div className="min-h-screen bg-background-base text-text-primary relative overflow-hidden">
      {/* ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-accent-violet/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5">
        {/* header */}
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-blue/10 border border-accent-blue/20 overflow-hidden flex items-center justify-center">
              <img src="/logo.png" alt="The Third Eye logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-display font-bold tracking-tight">The Third Eye</span>
          </div>
          <Link
            href="/auth/signin"
            className="flex items-center justify-center bg-accent-blue hover:bg-accent-blue/90 text-white rounded-input px-4 h-10 text-sm font-medium transition-all duration-150 active:scale-[0.98]"
          >
            Sign in
          </Link>
        </header>

        {/* hero */}
        <section className="pt-16 pb-12 text-center max-w-2xl mx-auto">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Your personal AI operating system
          </h1>
          <p className="text-text-secondary text-base md:text-lg mt-5 leading-relaxed">
            The Third Eye is a private, self-hosted workspace where an AI assistant helps you
            capture tasks and notes, search your own knowledge, track goals and finances, and stay
            on top of reminders — all in one place, owned entirely by you.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/auth/signin"
              className="flex items-center justify-center bg-accent-blue hover:bg-accent-blue/90 text-white rounded-input px-6 h-12 text-sm font-medium transition-all duration-150 active:scale-[0.98]"
            >
              Get started with Google
            </Link>
          </div>
          <p className="text-text-muted text-xs mt-4">
            Private by design — your data stays in your own workspace and is visible only to you.
          </p>
        </section>

        {/* what it does */}
        <section className="pb-16">
          <h2 className="text-center font-display text-2xl font-semibold mb-8">
            What you can do with The Third Eye
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-background-surface border border-border-default rounded-card p-5 text-left"
              >
                <h3 className="font-medium text-text-primary mb-2">{f.title}</h3>
                <p className="text-text-secondary text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* data transparency */}
        <section className="pb-16">
          <div className="bg-background-surface border border-border-default rounded-card p-6 max-w-3xl mx-auto">
            <h2 className="font-display text-lg font-semibold mb-3">Your data & why we ask for it</h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              The Third Eye uses your Google account solely to sign you in and identify your private
              workspace — we request your basic profile (name and email) for authentication only.
              Anything you create in the app — tasks, notes, and documents — is stored so it is
              available to you across your devices, and is visible only to you. We never sell your
              data or share it with third parties for advertising. If you enable optional
              integrations in the future, any additional access will be requested explicitly and
              used only to power features you turn on. Full details are in our{" "}
              <Link href="/privacy_policy" className="text-accent-blue hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </section>

        {/* footer */}
        <footer className="border-t border-border-default py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-text-muted text-xs">
          <span>© {new Date().getFullYear()} The Third Eye</span>
          <div className="flex items-center gap-4 font-mono">
            <Link href="/privacy_policy" className="hover:text-text-secondary transition-colors">
              Privacy Policy
            </Link>
            <span className="text-border-default">·</span>
            <Link href="/terms_of_service" className="hover:text-text-secondary transition-colors">
              Terms of Service
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
