# Google Sign-In & OAuth runbook

**Sign-in is Google, and it requests identity only** — `openid email profile`
(`SIGNIN_SCOPES` / `GOOGLE_SIGNIN_PARAMS` in `lib/googleToken.ts`, used by
`lib/auth.ts`). Gmail and Calendar are a second screen, *Settings → Connections
→ Connect Google*, which requests `CONNECT_SCOPES`.

That split is what keeps login working while Google's review of the mail scopes
is open. Asking for `gmail.readonly` on the sign-in button makes the review a
gate on logging in.

This document described the opposite until now, and kept doing so after the
change shipped. Two code comments and `/api/connect/google/status` were written
against that claim; the status route reported "Connected" to every signed-in
user as a result. If you are changing who grants what, this file is part of the
change.

## Read this before deploying

`gmail.readonly` is a **restricted** scope; `gmail.send` and
`calendar.events.owned.readonly` are **sensitive**.
Requesting any of them *at sign-in* makes Google's verification review a gate on
**logging in at all**, not just on the Gmail features:

| Consent screen status | Who can sign in, if sign-in asks for restricted scopes |
|---|---|
| Testing | Only accounts on the **test users** list (max 100). Everyone else gets `AccessDenied`. |
| In production, unverified | Test users only, and others see an "unverified app" warning. |
| In production, verified | Anyone. |

That is what was happening when sign-in asked for the mail scopes: the app
worked for its author, who is a test user, and refused everybody else.
**Sign-in does not ask for them**, so none of the rows above gate login.
Publishing the consent screen is enough for anyone to sign in with Google.
The unverified warning still applies to the separate *connect* screen, and
restricted-scope review (a CASA assessment) still gates Gmail — see
`docs/google-oauth-verification.md`.

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
  - `https://<your-domain>/api/connect/google/callback`  ← Gmail/Calendar connect

**Both are required.** The second one used to be marked optional, from when
sign-in granted the Gmail scopes itself. It is now the *only* way any user can
connect Gmail or Calendar. Omit it and the exchange in
`api/connect/google/callback` fails with `redirect_uri_mismatch`, which surfaces
as `?connect=google_error` on the Settings page — nowhere near this list.

Add the `http://localhost:3000` equivalents too for local dev.

## 2. OAuth consent screen

- User type: **External**.
- **Audience → Publishing status must be In production.** While it is Testing,
  Google refuses every account that is not a test user, including a
  name-and-email sign-in (`AccessDenied`). Publishing is allowed because
  sign-in does not request a sensitive scope.
- Keep the three feature scopes on Data Access. Do not add them to the sign-in
  request. Until verification finishes, only test users can complete *Connect
  Google*, and they see the unverified warning while doing it. That limits
  mail, not logging in.
- Branding must match the site: app name **The Third Eye**, home page
  `https://the-third-eye.anchit-tandon.com`, privacy policy
  `https://the-third-eye.anchit-tandon.com/privacy_policy`, terms
  `https://the-third-eye.anchit-tandon.com/terms_of_service`, authorised domain
  `anchit-tandon.com`. The privacy policy names the same three scopes.

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

## 5. Verification (needed for Gmail ingestion, not for sign-in)

Consent screen → submit for verification. Requires a **verified domain**
(Search Console), the app homepage, the privacy policy (`/privacy_policy`), and
for the **restricted** Gmail scope a demo video + security assessment.
Google reviews this over days–weeks; it cannot be automated.
