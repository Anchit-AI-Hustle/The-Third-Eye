# Life Log

An independent per-day record of what happened, at `/lifelog`.

## What it captures (per local day)
- **Audio** — the mic is recorded in ~45s chunks; each chunk's blob is stored
  on-device in **IndexedDB** (`lib/lifelog/audioStore.ts`) and is playable from
  the day view.
- **Transcript** — every non-silent chunk is transcribed via the
  `/api/transcribe` cascade (Groq → OpenAI Whisper). Near-silent chunks skip
  transcription so there's no hallucinated text.
- **Timeline of events** — the day's transcript is distilled into discrete
  events (`/api/tools/lifelog/extract`, cascaded LLM) — meeting / conversation /
  task / idea / decision / note — merged with diary entries and time-ordered.
- **Calendar** — a month grid; days with data are dotted; click any day to open
  its full view.
- **Dear diary** — free-form journal entries per day, shown inline on the timeline.
- **Day summary** — a short AI reflection on the day.

## Files
- `lib/lifelog/types.ts` — `DayLog`, `LogSegment`, `LogEvent`, `DiaryEntry`.
- `lib/lifelog/audioStore.ts` — IndexedDB blob store for audio.
- `lib/lifelog/store.ts` — localStorage-first day metadata + cloud best-effort
  mirror (`lifelog_days`), same pattern as the music library.
- `hooks/useDayRecorder.ts` — rolling chunked capture + silence-skip + per-chunk
  transcription.
- `components/lifelog/LifeLog.tsx` — recorder, calendar, day view, diary.
- `app/api/tools/lifelog/extract/route.ts` — transcript → timeline + summary.

## Platform limitation (important)
Browsers **pause microphone capture when the tab is backgrounded or the screen
is locked** — iOS Safari especially. So recording runs while the app is open and
foregrounded; the UI says so. True 24/7 background capture needs a native app
with background-audio entitlements (a future native companion), not achievable
in a PWA. Transcript, timeline, diary and summary persist across reloads
(localStorage + cloud best-effort); audio persists on-device via IndexedDB.
