import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { resolveAuthSecret } from "@/lib/authSecret";
import { clientIp, enter } from "@/lib/phoneAuth";

/**
 * SIGN-IN IS A MOBILE NUMBER AND A 4-DIGIT PIN, ported from parwah-hq.
 *
 * Google sign-in is commented out below rather than deleted, so restoring it is
 * uncommenting a block. Nothing was lost by taking it out of the login path:
 * Gmail and Calendar never ran on the session's Google token. They run on the
 * refresh token stored by the opt-in connect flow (`/api/connect/google`,
 * Settings → Connections), and both /api/chat and /api/act read that store and
 * ignore the session token entirely — the comment at chat/route.ts:1445 says so
 * in as many words. So Google remains a CONNECTION; it is simply no longer the
 * front door.
 *
 * The identity the rest of the app keys on is `session.user.email`, and it is
 * now the E.164 phone number instead of a Google address. Almost everything
 * treats it as an opaque key, which is why so little else changed — but NOT
 * everything did, and assuming otherwise broke two things quietly: Stripe
 * prefilled it as `customer_email` (which it rejects, so nobody signing in by
 * number could subscribe) and the cron addressed reminder mail `To:` it. Both
 * now ask `isEmailIdentity()` first (lib/serverIdentity.ts). Anything new that
 * wants to WRITE TO the identity rather than key on it has to do the same.
 * ACCOUNTS CREATED UNDER GOOGLE SIGN-IN KEEP THEIR DATA UNDER THEIR EMAIL KEY.
 * Signing in by number is a new identity, not a rename, and that has a
 * consequence worth stating plainly rather than in passing: with Google no longer
 * a provider, once an existing session's 24-hour JWT expires there is nothing
 * left that can produce the email identity, so its tasks, notes, billing row and
 * stored Google grant are no longer reachable from any sign-in. Nothing is
 * deleted, but on a deployment with real data somebody must re-key it —
 * DEVELOPMENT.md §4a has the one-off statement and the order to run it in.
 *
 * Deliberately not automatic. Linking two identities on a guess, on a path where
 * possession of the number is not yet proved, would hand one person's workspace
 * to whoever registered a number first; an obviously empty account is the safer
 * failure.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "phone",
      name: "Mobile number",
      credentials: {
        phone: { label: "Mobile number", type: "tel" },
        cc: { label: "Country code", type: "text" },
        pin: { label: "PIN", type: "password" },
        // Present only on sign-up: an unknown number that arrives with a name
        // creates the account, so signing up and signing in are one flow.
        name: { label: "Name", type: "text" },
      },
      // `req` is here for the caller's address alone, which `enter` uses as a
      // rate-limit key and never stores. This endpoint is unauthenticated and
      // does real work per call — a scrypt hash — so without a limit in front of
      // it anyone can spend the deployment's CPU, walk a list of numbers, or
      // re-lock somebody's account every fifteen minutes indefinitely.
      async authorize(credentials, req) {
        const res = await enter({
          phone: credentials?.phone,
          cc: credentials?.cc,
          pin: credentials?.pin,
          name: credentials?.name,
          ip: clientIp(req?.headers),
        });
        if (res.ok) {
          // `email` is the app's identity key, not an address. See the note above.
          return { id: res.user.id, name: res.user.name, email: res.user.phone };
        }
        // Thrown so the message reaches the form: a wrong PIN has to be able to
        // say how many tries are left, and a locked account how long for.
        throw new Error(res.error ?? "Could not sign you in.");
      },
    }),
    // ── GOOGLE SIGN-IN — COMMENTED OUT, KEPT FOR RESTORATION ────────────────
    // Uncommenting this block also needs, at the top of this file:
    //   import GoogleProvider from "next-auth/providers/google";
    //   import { getDb } from "@/lib/db";
    //   import { encrypt } from "@/lib/crypto";
    //   import { BASIC_SCOPE_LIST, INGESTION_SCOPE_LIST, hasGoogleScope } from "@/lib/googleToken";
    // and the `persistRefreshToken` / `refreshAccessToken` helpers, the `jwt`
    // callback that used them, the `session` callback that copied accessToken /
    // backendToken onto the session, the module augmentations that typed them,
    // and the two suites that covered all of it —
    // lib/__tests__/signinScopes.test.ts and authBackendExchange.test.ts — which
    // were deleted with the code they pinned rather than left asserting against
    // a comment.
    //
    // ONE OF THOSE HELPERS CARRIED A FIX THAT MUST COME BACK WITH IT (#313).
    // `persistRefreshToken` has to begin:
    //
    //   if (!INGESTION_SCOPE_LIST.some((s) => hasGoogleScope(scope, s))) return;
    //
    // google_tokens holds one row per user, upserted on user_id, and it is the
    // row the Gmail crons, /api/chat and /api/act all read. Sign-in asks
    // for identity only, so without that line a user who had connected Google
    // properly and then signed in again had their feature-scoped grant
    // overwritten by an identity-only one: Gmail stops working, and the row
    // looks healthier than ever because updated_at is fresh.
    //
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    //   authorization: {
    //     params: {
    //       // IDENTITY ONLY AT SIGN-IN, per docs/GOOGLE_OAUTH.md. Sign-in used
    //       // to request identity plus Gmail, Calendar and Chat so that one
    //       // consent screen did both jobs. gmail.readonly and gmail.send are
    //       // *restricted* scopes, and asking for them AT SIGN-IN makes
    //       // Google's verification review a gate on logging in at all: while
    //       // the screen is unverified only accounts on the test-user list get
    //       // in, and everyone else is refused with AccessDenied. It worked for
    //       // the owner, who is a test user, and refused every other person who
    //       // tried. Restricted-scope review needs a CASA assessment and takes
    //       // weeks, so identity-only was the difference between an app anyone
    //       // can use and an app only its author can use.
    //       scope: BASIC_SCOPE_LIST.join(" "),
    //       // offline + a forced consent are what actually yield a refresh
    //       // token. Without prompt=consent Google omits it for anyone who
    //       // authorized before, and the crons (reminders, Gmail scrape) can
    //       // only act while the user is away if one was stored.
    //       access_type: "offline",
    //       prompt: "consent",
    //       include_granted_scopes: "true",
    //     },
    //   },
    // }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    // Post-auth landing: always resolve to a proper in-app page. A bare
    // base-url redirect (which would otherwise show the marketing landing) goes
    // to the dashboard; same-origin callback URLs are preserved.
    async redirect({ url, baseUrl }) {
      if (url === baseUrl || url === `${baseUrl}/`) return `${baseUrl}/dashboard`;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/dashboard`;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  secret: resolveAuthSecret(),
};
