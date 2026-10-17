import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validCode } from "@/lib/authHandoff";
import { SignInClient } from "../signin/SignInClient";

// Opened in Safari by the home-screen app (SignInClient, standalone mode).
// Signed out: the normal Google sign-in, coming back here. Signed in: approve
// the app, whose short code is shown on both screens.
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in the app - The Third Eye" };

export default async function HandoffPage({ searchParams }: { searchParams: Promise<{ code?: string; done?: string; expired?: string }> }) {
  const { code, done, expired } = await searchParams;
  const shell = (body: React.ReactNode) => (
    <main className="min-h-screen bg-background-base flex items-center justify-center px-4">
      <div className="holo-card rounded-card p-8 w-full max-w-sm text-center space-y-4">{body}</div>
    </main>
  );
  if (!validCode(code)) return shell(<p className="text-text-secondary text-sm">This sign-in link is incomplete. Start again from the JARVIS app.</p>);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <SignInClient callbackUrl={`/auth/handoff?code=${code}`} initialError={null} />;
  if (done) return shell(<>
    <h1 className="font-display text-xl font-semibold text-text-primary">You&apos;re signed in</h1>
    <p className="text-text-secondary text-sm">Go back to the JARVIS app. It opens your workspace by itself.</p>
  </>);
  if (expired) return shell(<p className="text-text-secondary text-sm">This sign-in request expired or was already used. Tap Sign in again in the JARVIS app.</p>);
  return shell(<>
    <h1 className="font-display text-xl font-semibold text-text-primary">Sign in the JARVIS app?</h1>
    <p className="text-text-secondary text-sm">
      The app on your home screen shows the code <strong className="text-text-primary tabular-nums">{code.slice(0, 4).toUpperCase()}</strong>.
      Approve only if it matches, to sign it in as {session.user.email}.
    </p>
    <form method="post" action="/api/auth/handoff/approve">
      <input type="hidden" name="code" value={code} />
      <button type="submit" className="w-full rounded-card bg-accent-blue px-4 py-3 text-sm font-semibold text-background-base">Approve and sign in the app</button>
    </form>
  </>);
}
