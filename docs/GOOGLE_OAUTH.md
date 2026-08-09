# Google Sign-In & OAuth runbook

Sign-in uses NextAuth's Google provider with **only** the non-sensitive scopes
`openid email profile`. **Basic sign-in does not require Google's app
verification** — an unverified app can sign users in. Verification is only
needed to (a) remove the "unverified app" warning, (b) lift the 100-user
Testing cap, and (c) use the **restricted** Gmail/Chat scopes (the ingestion
feature, requested separately by the opt-in Connect flow).

The task tracker depends on being signed in, so getting the config below right
is what makes it work — no verification wait required.

## 1. Google Cloud Console — OAuth client

APIs & Services → Credentials → your OAuth 2.0 Client ID:

- **Authorized JavaScript origins**
  - `https://<your-domain>`
- **Authorized redirect URIs**
  - `https://<your-domain>/api/auth/callback/google`  ← sign-in
  - `https://<your-domain>/api/connect/google/callback`  ← Gmail/Chat connect (optional)

Add the `http://localhost:3000` equivalents too for local dev.

## 2. OAuth consent screen

- User type: **External**.
- If status is **Testing**, only listed **test users** can sign in (everyone
  else gets `AccessDenied`). Either add the accounts as test users, **or click
  "Publish app"** — for these non-sensitive scopes, publishing needs **no
  review**.

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
| `AccessDenied` | Consent screen in Testing and the account isn't a test user — publish or add the user. |
| `Configuration` | Missing server env — set the four variables above. |
| `OAuthSignin` | Wrong client id/secret or unauthorized origin. |

## 5. Verification (only for the warning + Gmail/Chat ingestion)

Consent screen → submit for verification. Requires a **verified domain**
(Search Console), the app homepage, the privacy policy (`/privacy_policy`), and
for the **restricted** Gmail/Chat scopes a demo video + security assessment.
Google reviews this over days–weeks; it cannot be automated.
