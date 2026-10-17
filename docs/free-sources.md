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
| Voice input / output | `GROQ_API_KEY` (Whisper) | Browser speech recognition and speech synthesis | Keyless in the browser |
| Music | `ELEVENLABS_API_KEY`, `REPLICATE_API_TOKEN` | Composed in code (`lib/music/synth.ts`): instrumental WAV, no vocals | Keyless |
| Video, reels, episodes | `REPLICATE_API_TOKEN` | Drawn scenes recorded in the browser (`lib/episodeVideo.ts`) | Keyless (in Studio) |
| Images | `REPLICATE_API_TOKEN` | None wired | Needs a key |
| Documents (PDF, DOCX) | - | Parsed in code (`lib/docText.ts`) | Keyless |
| Gmail, Calendar | Google OAuth | - | Free (OAuth, no billing) |
| WhatsApp chat | `WHATSAPP_TOKEN` | `wa.me` links the user sends | Keyless for sending; replies need the Cloud API |
| Scheduled jobs | `CRON_SECRET` | GitHub Actions (free on a public repo) | Free |
| Push notifications | VAPID keys | - | Free (self-generated keys) |

## Not wired, and why

- **Images without a key.** Pollinations offers keyless image generation,
  but its keyless rate limits and terms could not be verified from here, so
  it is not used. Gemini image models have no confirmed free quota.
- **Open-Meteo for weather.** Its free tier is for non-commercial use only;
  wttr.in already covers weather with no key.
- **Text-to-music APIs.** None is both free and keyless; music is composed
  in code instead.
- **Video in chat.** The chat's video tool still needs Replicate; the
  keyless drawn-scene renderer runs in the browser, so it lives in Studio.
