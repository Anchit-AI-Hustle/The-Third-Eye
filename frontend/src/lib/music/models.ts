// The Replicate model that sings (tags + lyrics → a full song), shared by the
// Studio route and the daily drop. It renders up to four minutes per call.
export const SONG_MODEL = process.env.MUSIC_SONG_MODEL || "lucataco/ace-step";
export const SONG_CLIP_MAX = 240;
