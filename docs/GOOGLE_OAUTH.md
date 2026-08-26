# Google Sign-In & OAuth runbook

Sign-in uses NextAuth's Google provider and requests **every** scope the app
uses in one consent screen — `openid email profile` plus Gmail, Calendar and
Chat (`lib/googleToken.ts` → `SIGNIN_SCOPES`). Signing in with Google therefore
*is* connecting Google: the user is asked once, at that moment, and Gmail and
Calendar work immediately with nothing to connect afterwards.

## Read this before deploying

`gmail.readonly` and `gmail.send` are **restricted** scopes, and requesting them
at sign-in makes verification a **gate on logging in at all**, not just on the
Gmail features:

| Consent screen status | Who can sign in |
|---|---|
| Testing | Only accounts on the **test users** list (max 100). Everyone else gets `AccessDenied`. |
| In production, unverified | Test users only, and others see an "unverified app" warning. |
| In production, verified | Anyone. |

So while the app is unverified, **only test users can log in**. Add every
account that needs access under *OAuth consent screen → Test users*, or complete
the review in `docs/google-oauth-verification.md`. Restricted-scope review needs
a CASA security assessment and takes weeks.

### Rollback

If sign-in must work for arbitrary accounts before verification clears, drop
back to identity-only scopes in `lib/auth.ts`:

```ts
scope: BASIC_SCOPE_LIST.join(" "),   // instead of SIGNIN_SCOPES
```

Login then works for anyone with no review, and Gmail/Calendar go back to being
opt-in through *Settings → Connections → Connect Google*, which requests
`INGESTION_SCOPES` on its own. That connect route stays wired either way, so
this is a one-line change with no other edits.

Nothing is silently broken in the meantime: the granted scope string is stored
with the refresh token, and `googleCapabilities()` reads it, so a user who
unticks Gmail on the consent screen is told the feature isn't connected rather
than watching it fail.

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
  else gets `AccessDenied`). Add each account under **Test users**.
- "Publish app" alone is **not** enough now that sign-in requests restricted
  Gmail scopes: publishing without review still limits sign-in to test users and
  shows the unverified warning. Either finish verification, or take the rollback
  above.

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
