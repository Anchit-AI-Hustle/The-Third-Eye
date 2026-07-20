# Music generation — model knowledge base

This is the reference the Music Studio routing is built on. It records which
text-to-music (TTM) models exist, what they can do, and how our fallback chain
picks one when a provider is unavailable.

## Sources

- **Music Arena: Live Evaluation for Text-to-Music** — arXiv 2507.20900
  ([abs](https://arxiv.org/abs/2507.20900) ·
  [pdf](https://arxiv.org/pdf/2507.20900) ·
  [html v2](https://arxiv.org/html/2507.20900v2)).
  An open, LLM-routed human-preference leaderboard for TTM systems — the source
  of the roster below. It evaluates systems rather than proposing a generator,
  which is exactly why it's a useful neutral map of the landscape.
- **MusicGen-large** — Meta, [huggingface.co/facebook/musicgen-large](https://huggingface.co/facebook/musicgen-large).
  3.3B autoregressive transformer, text→32 kHz mono WAV, ~50 tokens/s of audio.
  Instrumental only (no realistic vocals), English-centric, needs prompt
  engineering. `facebook/musicgen-small` is the free-tier-friendly sibling.

## Model roster (from Music Arena)

| Model | Owner | License | Vocals / lyrics | Notes |
|---|---|---|---|---|
| MusicGen (small/medium/large) | Meta | OPEN | ✗ instrumental | Our free HF fallback. Short clips; loop to extend. |
| Stable Audio (Open / 3) | Stability | OPEN | ✗ instrumental | Our primary instrumental model on Replicate (`stability-ai/stable-audio`). |
| Magenta RealTime | Google | OPEN | ✗ instrumental | Real-time / streaming oriented. |
| ACE-Step (1.5 Turbo) | OPEN | OPEN | ✓ lyrics | Our primary vocal model on Replicate (`lucataco/ace-step`). |
| Sonauto v2.2 | proprietary | free tier | ✓ lyrics | Full song w/ vocals; candidate future vocal fallback. |
| ElevenLabs Music v1 | proprietary | paid | ✓ lyrics | High quality; needs infra + credit. |
| Lyria (2 / 3 Pro) | Google | proprietary | ✓ lyrics | High quality; gated. |

## How the Music Studio routes (see `frontend/src/app/api/tools/music/route.ts`)

1. **Vocals requested + lyrics present** → `lucataco/ace-step` on Replicate
   (tags + lyrics + duration). On failure → instrumental fallback.
2. **Instrumental (or no lyrics)** → `stability-ai/stable-audio` on Replicate
   (prompt + seconds_total).
3. **Replicate missing / throttled (429) / out of credit** → free HuggingFace
   serverless Inference with MusicGen (`facebook/musicgen-small`, override via
   `HF_MUSIC_MODEL`). Instrumental only; returns audio inline as a `data:` URI
   so it plays without polling. Gated on `HF_API_TOKEN` — absent ⇒ we keep the
   Replicate behaviour and surface the prompt/lyrics to paste elsewhere.

Text-to-music models render seconds→minutes per call. Long sessions (up to 5h)
are produced by **seamlessly looping** a base clip in the player, so we cap the
generated clip to each model's practical maximum (stable-audio 120s, ace-step
240s, MusicGen ≤30s on the free tier) and loop it to fill `sessionSeconds`.

## Practical takeaways baked into the code

- MusicGen can't sing → the HF fallback covers the **instrumental** path only.
  A vocal request that reaches the fallback comes back instrumental (flagged
  `fellBackToInstrumental`) with the lyrics still shown.
- Prompt engineering matters: we build a rich style string (`buildTags`) from
  genre/subgenre/mood/BPM/energy/instruments/structure/artist-vibe rather than
  passing the bare description.
- Keep the roster above in sync with Music Arena as new open models land; the
  cheapest capable OPEN model wins for a free fallback.
