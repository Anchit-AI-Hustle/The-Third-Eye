# Calculators — income automation

Two revenue systems ship with the `/calculators` section. Both are **built and
type-safe**; each goes live when you add your own credentials/links. Nothing
here creates accounts, posts as anyone but you, or promises "guaranteed" income —
it grows the calculators' organic traffic and monetizes it honestly.

---

## 1. Affiliate offers (passive, per-visitor revenue)

Offers live in `src/lib/calculators/offers.ts`. Each calculator page shows the
offers whose `tags` match the page's `offerTags` — loan pages show loan offers,
SIP pages show broker offers.

**To turn one on:** join the affiliate programme, paste your tracking URL into
`url`, set `enabled: true`, redeploy. Disabled/empty offers never render, so you
can't ship a dead link. Every offer link carries `rel="sponsored noopener"` and
a disclosure line automatically (Google + FTC/ASCI requirement).

---

## 2. Automated social posting (drives traffic → SEO + affiliate revenue)

A daily job generates a finance post — a calculator spotlight or an evergreen
tip — and publishes it to **every channel you've connected**. Content is written
by Claude (falls back to a fixed template if no key). It posts **only to your own
accounts**, via official APIs.

### Endpoints

| Route | Purpose |
|---|---|
| `GET/POST /api/cron/social-post` | Generate today's post and publish it. `?dry=1` = generate only. |
| `GET /api/automation/preview?seed=N` | Preview a draft without posting. |
| `GET /api/automation/status` | Which channels are connected + today's scheduled content. |

### Environment variables

Content generation:
- `ANTHROPIC_API_KEY` — enables Claude-written posts (optional; template used otherwise).
- `AUTOMATION_MODEL` — override the model (default `claude-sonnet-5`).

Security:
- `CRON_SECRET` — required in production. The cron/preview routes need
  `Authorization: Bearer <CRON_SECRET>`.

Channels (set only the ones you use — each is independent):
- **X / Twitter:** `X_ACCESS_TOKEN` (OAuth2 user token, `tweet.write` scope).
- **LinkedIn:** `LINKEDIN_ACCESS_TOKEN` (`w_member_social`) + `LINKEDIN_AUTHOR_URN`
  (e.g. `urn:li:person:xxxx`).
- **Everything else (Instagram, Facebook, Threads, Reddit, Telegram, …):**
  `AUTOMATION_WEBHOOK_URL` — a Zapier / Make / n8n / IFTTT hook you own. The job
  POSTs `{ text, link, hashtags, composed }`; your automation fans it out to any
  platform using your existing connections. This is the simplest way to cover
  "all channels" without per-platform OAuth here.

### Schedule it (Vercel Cron)

Add to `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/social-post", "schedule": "0 4 * * *" }]
}
```

Vercel Cron automatically sends the `CRON_SECRET` bearer. That's it — one post a
day, fully automated, to every connected channel.

### Tune content

- Post rotation + tips: `src/lib/automation/content.ts`
- Hashtags, model, post format: `src/lib/automation/config.ts`
