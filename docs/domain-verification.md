# Domain / Brand Verification — runbook

The **code side is done** and ships inert: `frontend/src/app/layout.tsx` renders
verification meta tags from env vars, `robots.ts` + `sitemap.ts` expose the site
to crawlers, and `lib/site.ts` holds the canonical origin. No verification tag is
emitted until you set the matching env var, so this is safe to deploy as-is.

What remains can only be done by you, in the provider consoles + DNS zone for
`anchit-tandon.com`. Do these once, then redeploy.

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

DNS-only, no code. From your email sender (Google Workspace / the cron mailer):

| Record | Host | Value (example) |
|---|---|---|
| SPF (TXT) | `@` | `v=spf1 include:_spf.google.com ~all` |
| DKIM (TXT/CNAME) | provider selector, e.g. `google._domainkey` | issued by the provider |
| DMARC (TXT) | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:you@anchit-tandon.com` |

Add all three to the `anchit-tandon.com` DNS zone. SPF/DKIM stop your reminder
and digest emails from landing in spam; DMARC ties them together.

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
