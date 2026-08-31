# Domain / Brand Verification — runbook

The **code side is done** and ships inert: `frontend/src/app/layout.tsx` renders
verification meta tags from env vars, `robots.ts` + `sitemap.ts` expose the site
to crawlers, and `lib/site.ts` holds the canonical origin. No verification tag is
emitted until you set the matching env var, so this is safe to deploy as-is.

What remains can only be done by you, in the provider consoles + DNS zone for
`anchit-tandon.com`. Do these once, then redeploy.

## Current state — audited 2026-08-28 over DNS-over-HTTPS

Queried live, so this is what the zone actually serves rather than what was
intended:

| Check | Result |
|---|---|
| `the-third-eye.anchit-tandon.com` | CNAME → `cname.vercel-dns.com` → `66.33.60.194`, `76.76.21.93` — correct Vercel setup, site returns HTTP 200 |
| `anchit-tandon.com` (apex) | A → `64.29.17.1`, `64.29.17.65` (Vercel) |
| Google Search Console | **Verified.** `google-site-verification=…` TXT present on the apex — the Domain-property method, which covers every subdomain. Nothing to deploy, and `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is not needed. |
| Meta domain verification | **Not done** — no `facebook-domain-verification` TXT, and no meta tag rendered on the live homepage. Only needed if you run Meta ads. |
| Bing | **Not done** — no meta tag rendered. Optional. |
| SPF | **Absent** |
| DMARC | **Absent** |
| MX | **Absent** — the domain receives no mail |

**Nothing is broken.** The site resolves correctly and search verification is in
place. What is missing is the anti-spoofing pair in section 4, plus the two
optional verifications above.

None of the `NEXT_PUBLIC_*_VERIFICATION` env vars are set in production, which
is why no verification `<meta>` tag appears in the homepage source. That is
expected — Google was verified by TXT instead.

## 1. Google Search Console (search verification)

Property type **Domain** (covers all subdomains) is best:

1. Search Console → Add property → **Domain** → enter `anchit-tandon.com`.
2. It gives a `google-site-verification=…` **TXT record**. Add it to the DNS
   zone for `anchit-tandon.com` (GoDaddy → DNS → Add → TXT, host `@`).
3. Click **Verify**. Done — nothing to deploy for the Domain method.

Or property type **URL prefix** (`https://the-third-eye.anchit-tandon.com`):

1. Choose the **HTML tag** method; copy the `content="…"` value.
2. Set it in Vercel: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<value>` (all envs).
3. Redeploy, then click **Verify** — the `<meta name="google-site-verification">`
   tag is now rendered by `layout.tsx`.

## 2. Meta / Facebook Business (brand domain verification)

Meta Business Suite → **Brand Safety → Domains** → add
`the-third-eye.anchit-tandon.com`, then pick one:

- **Meta-tag method:** copy the `content` value → set
  `NEXT_PUBLIC_FB_DOMAIN_VERIFICATION=<value>` in Vercel → redeploy → Verify.
- **DNS TXT method:** add the `facebook-domain-verification=…` TXT record to DNS
  → Verify (no deploy needed).

## 3. Bing Webmaster Tools (optional)

HTML Meta Tag method → copy the `msvalidate.01` content value →
`NEXT_PUBLIC_BING_SITE_VERIFICATION=<value>` in Vercel → redeploy → Verify.

## 4. Email domain authentication (SPF / DKIM / DMARC)

DNS-only, no code.

> **This does not affect reminder or digest deliverability.** An earlier version
> of this doc said SPF/DKIM here "stop your reminder and digest emails from
> landing in spam". They don't. `sendGmail()` in `frontend/src/lib/google.ts`
> sets no `From:` header, so Gmail's `messages/send` stamps the **authenticated
> account** as the sender — and the token comes from the *user's own* stored
> Google grant. Those mails leave as the user, through Google's servers,
> authenticated by Gmail's SPF/DKIM/DMARC. Records on `anchit-tandon.com` have
> no bearing on them.

What these records are actually for here is **anti-spoofing**. The domain sends
no mail of its own (no MX, no SPF — see the audit above), and a domain with
neither SPF nor DMARC can be spoofed by anyone. The correct hardening for a
non-sending domain is to say so explicitly:

| Record | Host | Value | Why |
|---|---|---|---|
| SPF (TXT) | `@` | `v=spf1 -all` | "Nothing is authorised to send as this domain." |
| DMARC (TXT) | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:anchit.tandon@vahdam.com` | Reject anything claiming to be from here, and report it. |

No DKIM record is needed while nothing sends from the domain.

**If you later send mail from `@anchit-tandon.com`** — Google Workspace, a
transactional provider, anything — `-all` will block it. Swap SPF to that
provider's include (Workspace: `v=spf1 include:_spf.google.com ~all`), add the
provider's DKIM selector, and relax DMARC to `p=quarantine` until you have
confirmed the reports are clean.

## Env vars added

```
NEXT_PUBLIC_APP_URL=https://the-third-eye.anchit-tandon.com
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=   # Search Console HTML-tag content
NEXT_PUBLIC_FB_DOMAIN_VERIFICATION=     # Meta domain-verification content
NEXT_PUBLIC_BING_SITE_VERIFICATION=     # Bing msvalidate.01 content
```

`scripts/setup-vercel-env.sh` now prompts for all of these.

## Verify it worked

- `https://the-third-eye.anchit-tandon.com/robots.txt` → lists sitemap + rules.
- `https://the-third-eye.anchit-tandon.com/sitemap.xml` → lists public pages.
- View-source the homepage → the verification `<meta>` tags appear once the
  env vars are set.
