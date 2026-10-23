# Free sources for every keyed feature

What each feature uses when its key is missing, checked against the code on
2026-10-17. "Keyless" means it works today with no key at all.

| Feature | Key it can use | Without the key | Status |
| --- | --- | --- | --- |
| Chat, extraction, agents | Any of the LLM keys (`GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, paid ones) | Free tiers lead the cascade (`lib/llmCascade.ts`). Each user can add their own free key, or the https URL of their own Ollama, in Settings > AI providers. Background jobs never use paid providers. | Free keys needed (no keyless LLM is reliable) |
| Web search | `SERPER_API_KEY` | DuckDuckGo HTML, Bing (`lib/freeSearch.ts`) | Keyless |
| News | - | Google News RSS | Keyless |
| Stocks | - | Yahoo Finance chart API | Keyless |
| Nearby places | - | OpenStreetMap Nominatim | Keyless |
| Weather | `OPENWEATHER_API_KEY` | wttr.in | Keyless |
| Voice input / output | `GROQ_API_KEY` (Whisper) | Browser speech recognition; for output, the optional Natural voice (Kokoro, in the browser on WebGPU) or the system voice | Keyless in the browser |
| Music | `ELEVENLABS_API_KEY`, `REPLICATE_API_TOKEN` | Composed in code (`lib/music/synth.ts`): instrumental WAV, no vocals | Keyless |
| Video, reels, episodes | `REPLICATE_API_TOKEN` | Drawn scenes recorded in the browser (`lib/episodeVideo.ts`) | Keyless (in Studio) |
| Images | `REPLICATE_API_TOKEN` | Drawn as SVG code by the free-tier AI (`lib/svgArt.ts`): illustrations, icons, logos, posters, not photos | Free (no image key) |
| Documents (PDF, DOCX) | - | Parsed in code (`lib/docText.ts`) | Keyless |
| Gmail, Calendar | Google OAuth | - | Free (OAuth, no billing) |
| WhatsApp chat | `WHATSAPP_TOKEN` | `wa.me` links the user sends | Keyless for sending; replies need the Cloud API |
| Scheduled jobs | `CRON_SECRET` | GitHub Actions (free on a public repo) | Free |
| Push notifications | VAPID keys | - | Free (self-generated keys) |

## Not wired, and why

- **Photo-realistic images without a key.** Pollinations offers keyless
  image generation, but its keyless limits and terms could not be verified
  from here, so it is not used. Images are drawn as SVG code instead, which
  suits illustrations rather than photos.
- **Open-Meteo for weather.** Its free tier is for non-commercial use only;
  wttr.in already covers weather with no key.
- **Text-to-music APIs.** None is both free and keyless; music is composed
  in code instead.
- **Video in chat.** Without Replicate the chat opens Video or Reel Studio
  with the idea filled in, where the video is drawn and recorded in the
  browser.
