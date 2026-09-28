# Google Sign-In & OAuth runbook

Sign-in requests **identity only** — `openid email profile`
(`lib/googleToken.ts` → `BASIC_SCOPE_LIST`). Gmail, Calendar and Chat are **not**
granted by signing in. They are opt-in, through *Settings → Connections →
Connect Google*, which requests `INGESTION_SCOPES` on its own consent screen.

This document described the opposite until now, and kept doing so after the
change shipped. Two code comments and `/api/connect/google/status` were written
against that claim; the status route reported "Connected" to every signed-in
user as a result. If you are changing who grants what, this file is part of the
change.

## Read this before deploying

`gmail.readonly` and `gmail.send` are **restricted** scopes. Requesting them *at
sign-in* makes Google's verification review a gate on **logging in at all**, not
just on the Gmail features:

| Consent screen status | Who can sign in, if sign-in asks for restricted scopes |
|---|---|
| Testing | Only accounts on the **test users** list (max 100). Everyone else gets `AccessDenied`. |
| In production, unverified | Test users only, and others see an "unverified app" warning. |
| In production, verified | Anyone. |

That is what was happening: the app worked for its author, who is a test user,
and refused everybody else. **Sign-in no longer asks for them**, so none of the
rows above gate login today. Publishing the consent screen is enough for anyone
to sign in; the unverified warning still applies to the separate *connect*
screen, and restricted-scope review (a CASA assessment, weeks) still gates
Gmail/Chat ingestion — see `docs/google-oauth-verification.md`.

Nothing is silently broken in the meantime: the granted scope string is stored
with the refresh token and `googleCapabilities()` reads it, so a user without
Gmail is told the feature isn't connected rather than watching it fail. And an
identity-only grant is never written to `google_tokens` — it would displace a
working feature-scoped one, since that table holds one row per user.

### Restoring the one-screen flow

Once restricted-scope verification clears, sign-in can ask for everything again
and connecting becomes unnecessary. In `lib/auth.ts`:

```ts
scope: SIGNIN_SCOPES,   // instead of BASIC_SCOPE_LIST.join(" ")
```

`src/lib/__tests__/signinScopes.test.ts` exists to stop that happening by
accident before the review clears; delete it deliberately as part of that
change, and update this file with it.

## 1. Google Cloud Console — OAuth client

APIs & Services → Credentials → your OAuth 2.0 Client ID:

- **Authorized JavaScript origins**
  - `https://<your-domain>`
- **Authorized redirect URIs**
  - `https://<your-domain>/api/auth/callback/google`  ← sign-in
  - `https://<your-domain>/api/connect/google/callback`  ← Gmail/Chat connect

**Both are required.** The second one used to be marked optional, from when
sign-in granted the Gmail scopes itself. It is now the *only* way any user can
connect Gmail, Calendar or Chat. Omit it and the exchange in
`api/connect/google/callback` fails with `redirect_uri_mismatch`, which surfaces
as `?connect=google_error` on the Settings page — nowhere near this list.

Add the `http://localhost:3000` equivalents too for local dev.

## 2. OAuth consent screen

- User type: **External**.
- If status is **Testing**, only listed **test users** can sign in (everyone
  else gets `AccessDenied`). Add each account under **Test users**.
- **Publish app** is enough for sign-in, because sign-in asks for identity only.
  Users then see no warning and no test-user list applies.
- Verification is still required for the **connect** flow's restricted Gmail/Chat
  scopes. Until it clears, only test users can complete *Connect Google*, and
  they see the unverified warning while doing it. That limits a feature; it no
  longer limits logging in.

## 3. Deployment env (Vercel → Production)

| Variable | Value |
|---|---|
| `NEXTAUTH_URL` | `https://<your-domain>` (exact origin, no trailing slash) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | from the OAuth client |
| `GOOGLE_CLIENT_SECRET` | from the OAuth client |

Redeploy after changing any of these.

## 4. Diagnosing failures

The `/auth/error` page shows the NextAuth error code and the likely fix:

| Code | Meaning / fix |
|---|---|
| `OAuthCallback` | Redirect-URI mismatch — add the exact `…/api/auth/callback/google` URI; check `NEXTAUTH_URL`. |
| `AccessDenied` | Consent screen in Testing and the account isn't a test user — publish or add the user. Since sign-in asks for identity only, publishing resolves this outright. |
| `Configuration` | Missing server env — set the four variables above. |
| `OAuthSignin` | Wrong client id/secret or unauthorized origin. |
| `?connect=google_error` on Settings | Not a NextAuth code — the *connect* flow. Usually `…/api/connect/google/callback` missing from Authorized redirect URIs, or the account is not a test user while the restricted scopes are unverified. |

## 5. Verification (needed for Gmail/Chat ingestion, not for sign-in)

Consent screen → submit for verification. Requires a **verified domain**
(Search Console), the app homepage, the privacy policy (`/privacy_policy`), and
for the **restricted** Gmail/Chat scopes a demo video + security assessment.
Google reviews this over days–weeks; it cannot be automated.
