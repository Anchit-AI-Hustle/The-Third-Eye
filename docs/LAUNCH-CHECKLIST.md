# Website Launch Checklist

Run through every item before shipping a new page, microsite, or major update. Do not assume — inspect the built `www/` output directly.

## The Page
- [ ] Every section has one clear job you can state in one line.
- [ ] No placeholder text (`lorem ipsum`, `TODO`, fabricated quotes/metrics on real brands).
- [ ] One primary accent colour used consistently for buttons and key highlights (`DESIGN.md` / brand tokens).
- [ ] Headings that do the same job share the same type step; vertical spacing between sections is consistent.
- [ ] Every button, link, and interactive control has a hover state and `:focus-visible` outline.

## Images & Video
- [ ] Hero image `<= ~300 KB` (WebP, `<= 1920px` wide); other images `<= ~150 KB` (WebP, `<= 1000px` wide).
- [ ] Hero video `< 4 MB`, `<= 1080p`, no audio track (`-an`), shows `-poster.webp` immediately, `muted loop playsinline`.
- [ ] Below-the-fold images use `loading="lazy"`.
- [ ] Every `<img>` has descriptive `alt` text (not `"image 1"`).
- [ ] Nothing is stretched or awkwardly cropped at `390px`, `768px`, and `1440px`.

## Motion & 3D
- [ ] Restraint: at most a slow hero visual + 1–2 other cinematic moves (pinned section, scroll-linked motion, parallax, or one 3D moment).
- [ ] UI animations are quick (`< 500ms`), happen once, animate `transform`/`opacity` only, and nothing critical waits on them.
- [ ] `prefers-reduced-motion: reduce` (and `html[data-motion="off"]`) disables continuous motion, replaces pinned sections with a plain stacked layout, and replaces live 3D / scroll-video with a still image.
- [ ] Live 3D is lazy-loaded near the viewport, capped at `DPR <= 2`, falls back to a still image on small phones (`<= 480px`) and on WebGL error, and (for standalone 3D demos) exposes `CONFIG`, `PRESETS`, `?embed`, `?preset=N`, and `?tour`.

## Mobile (`390px`)
- [ ] No text too small (`>= 11px` mono floor) or overflowing; no mid-word clipping.
- [ ] Comfortable edge padding; nothing touching screen edges.
- [ ] No unintended horizontal scroll (`overflow-x: clip` on `html, body`, never `hidden` on `body`).
- [ ] Mobile navigation menu button opens and closes cleanly.
- [ ] Touch targets are thumb-sized (`>= 44px`).
- [ ] Verified on a real phone, not just desktop DevTools.

## Forms & Keys
- [ ] Empty messages and invalid emails are rejected client- and server-side with clear error copy; valid submissions show a clear success state and persist in the backend/Supabase table (with RLS enabled: insert-only for public, no public read).
- [ ] Basic spam-bot protection is in place.
- [ ] Secret keys live in `.env.local` (never committed, `.env.local` in `.gitignore`), never in client code, commits, or screenshots, and are configured in Vercel/Cloudflare environment variables.

## Live, SEO & Social
- [ ] `npm run build` succeeds and `www/` is up to date.
- [ ] Automated checks pass against `www/` (`npm run test:seo`, `npm run test:mobile`, `npm run test:design`, `npm run test:sitemap`, `npm run test:routes`, `npm run test:nogithub`, `npm run test:nodash`).
- [ ] `<title>` (`< 60` chars) and `<meta name="description">` (`60–155` chars) describe what the page offers in plain human language.
- [ ] `og:image` (`1200x630` WebP), `canonical` URL, `favicon`, `sitemap.xml`, and `robots.txt` are present and valid.
