# Music Studio — four-agent generation pipeline

Music generation is decomposed into four cooperating agents, each a specialised
**cascaded** LLM call (`llmCascade` → multi-provider fallback), grounded in a
universal music knowledge base. Orchestrated in `frontend/src/app/api/tools/music/route.ts`.

```
Musicologist ──▶ Beat-smith ─┐
     │                       ├──▶ Conductor ──▶ FinalPlan ──▶ audio model (+ video)
     └──────────▶ Lyricist ──┘
```

| Agent | File | Role | Output |
|---|---|---|---|
| **Musicologist** | `lib/music/agents.ts::musicologist` | Understands music worldwide & through history; grounds the request in the KB | `MusicBrief` (genre lineage, region, era, BPM, instruments, structure, moods, vocal style, reference feel, cultural context) |
| **Beat-smith** | `agents.ts::beatSmith` | Designs the arrangement/beats + writes the text-to-music model prompt | `BeatSpec` (modelPrompt, styleTags, tempo, arrangement) |
| **Lyricist** | `agents.ts::lyricist` | Writes singable lyrics that fit the brief's structure/mood/language | tagged lyrics (`[verse]/[chorus]…`) |
| **Conductor** | `agents.ts::conductor` | Synchronises brief + beats + lyrics into one coherent generation | `FinalPlan` (prompt, tags, lyrics) |

Beat-smith and Lyricist run **in parallel** (they only depend on the brief);
the Conductor merges them. If every LLM provider is down the route falls back to
deterministic tag assembly so instrumental generation still works.

## Universal music knowledge base — `lib/music/knowledge.ts`

`GENRE_KB` is a curated set of ~50 anchors covering the major families and world
traditions across eras:

- **Electronic** — house/deep/tech house, techno, hard techno, acid, trance, psytrance, DnB, dubstep, ambient, synthwave, lo-fi
- **Hip-hop** — boom bap, trap, drill, G-funk
- **Pop** — pop, dance-pop, K-pop, hyperpop, city pop
- **Rock/Metal** — rock, indie, punk, metal, shoegaze
- **Jazz/Blues/Soul/Funk** — jazz, smooth jazz, blues, soul, funk, disco, R&B
- **Classical/Cinematic** — classical, cinematic, minimalism
- **Folk/Country** — folk, country
- **World** — afrobeats, afrobeat, amapiano, reggae, reggaeton, latin pop, bossa nova, bollywood, bhangra, hindustani/carnatic classical, arabic pop, flamenco, celtic
- **Chill/Other** — trip-hop, new age

Each entry carries region, era, BPM range, instruments, structure, moods, vocal
style, reference artists (for *feel* only — never copied), and production notes.

`lookupGenres()` fuzzy-matches the request against names + aliases; the
Musicologist reads that grounding **plus its own training** to cover the long
tail — so the KB is *anchors + LLM reasoning*, not a closed list.

## Video (Music Studio)

Video is now an **up-front option** ("Also create a music video" toggle) chosen
before generation. When on, the visualizer renders automatically as soon as the
audio is ready (`onAudioReady` in `MusicStudio.tsx`), spanning the full session
via the seamless loop (see `lib/musicVideo.ts`). It can still be generated
manually after the fact.
