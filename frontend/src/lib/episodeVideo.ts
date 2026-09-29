// Assembles rendered Video Studio clips into one episode file, in the browser:
// a title card, every shot in order with its voice-over and burned-in subtitle,
// and an end card, drawn to a canvas and recorded with MediaRecorder (the same
// approach as lib/musicVideo.ts). No ffmpeg, no server storage — the file is
// built on the user's machine and downloaded from there.
//
// Recording is real time, so a 45-second episode takes about 45 seconds, and the
// tab has to stay in front: browsers pause requestAnimationFrame in background
// tabs, which would freeze the picture.

export interface EpisodeShot {
  title: string;
  clipUrl: string;
  narration: string;
  voiceUrl?: string;
}

export type Aspect = "16:9" | "9:16";

export interface Soundtrack {
  /** A same-origin path, a blob: URL, or an allowlisted provider URL (proxied). */
  url: string;
  /** Where in the track to start, in seconds — for a reel, the strongest bars. */
  start?: number;
}

export interface Segment {
  kind: "title" | "shot" | "end";
  start: number;
  end: number;
  /** Index into the shots, for kind "shot". */
  shot?: number;
}

const TITLE_SECONDS = 3;
const END_SECONDS = 2;
const VOICE_TAIL = 0.4;
const FADE = 0.35;

/**
 * Lay the episode out in time. A shot lasts as long as its clip, or as long as
 * its voice-over plus a short tail if that runs longer — the last frame holds
 * rather than the line spilling into the next shot. A reel has no title or end
 * card: it has to run its stated length, and its last shot loops into its first.
 */
export function planTimeline(shots: { clip: number; voice: number }[], cards = true): Segment[] {
  const segs: Segment[] = cards ? [{ kind: "title", start: 0, end: TITLE_SECONDS }] : [];
  let t = cards ? TITLE_SECONDS : 0;
  shots.forEach((s, i) => {
    const len = Math.max(s.clip, s.voice > 0 ? s.voice + VOICE_TAIL : 0);
    segs.push({ kind: "shot", start: t, end: t + len, shot: i });
    t += len;
  });
  if (cards) segs.push({ kind: "end", start: t, end: t + END_SECONDS });
  return segs;
}

export const canvasSize = (aspect: Aspect) => (aspect === "9:16" ? { W: 720, H: 1280 } : { W: 1280, H: 720 });

/**
 * Fill the frame, cropping the overflow — a landscape clip in a reel loses its
 * sides rather than sitting in a letterbox, which is how every reel app shows it.
 */
export function coverFit(vw: number, vh: number, W: number, H: number) {
  const k = Math.max(W / vw, H / vh);
  const w = vw * k, h = vh * k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/**
 * The soundtrack's gain over time: under a voice-over it ducks so the words
 * stay clear, and it fades out over the end card instead of cutting off.
 */
export const MUSIC_FULL = 0.9;
export const MUSIC_DUCKED = 0.28;
export const MUSIC_FADE_OUT = 1.5;

/** The first recorder format this browser supports, MP4 first so the file plays everywhere. */
function pickFormat(): { mime: string; ext: "mp4" | "webm" } {
  const options: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm", "webm"],
  ];
  const hit = options.find(([m]) => MediaRecorder.isTypeSupported(m));
  if (!hit) throw new Error("This browser can't record video.");
  return { mime: hit[0], ext: hit[1] };
}

// Provider media is cross-origin; a cross-origin frame taints the canvas and
// Web Audio refuses to decode it, so everything comes through the same-origin proxy.
const proxied = (url: string) => `/api/tools/music/proxy?url=${encodeURIComponent(url)}`;
const local = (url: string) => (/^https?:/.test(url) ? proxied(url) : url);

async function loadClip(url: string, n: number): Promise<HTMLVideoElement> {
  const res = await fetch(proxied(url));
  if (!res.ok) throw new Error(`Shot ${n}'s clip could not be loaded — its link may have expired. Re-render it and try again.`);
  const v = document.createElement("video");
  v.src = URL.createObjectURL(await res.blob());
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  await new Promise<void>((ok, bad) => {
    v.onloadeddata = () => ok();
    v.onerror = () => bad(new Error(`Shot ${n}'s clip could not be decoded.`));
  });
  if (!Number.isFinite(v.duration)) {
    // A recorded WebM states no duration until the player has seeked to its end;
    // an endless clip would make the whole timeline endless.
    await new Promise<void>((ok) => {
      v.ondurationchange = () => { if (Number.isFinite(v.duration)) ok(); };
      v.currentTime = 1e101;
    });
    v.ondurationchange = null;
    v.currentTime = 0;
  }
  return v;
}

async function loadVoice(ctx: AudioContext, url: string, n: number): Promise<AudioBuffer> {
  const res = await fetch(proxied(url));
  if (!res.ok) throw new Error(`Shot ${n}'s voice-over could not be loaded — voice it again and retry.`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

async function loadSoundtrack(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(local(url));
  if (!res.ok) throw new Error("The soundtrack could not be loaded — pick it again and retry.");
  try { return await ctx.decodeAudioData(await res.arrayBuffer()); }
  catch { throw new Error("The soundtrack isn't an audio file this browser can play."); }
}

function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function assembleEpisode(opts: {
  title: string;
  shots: EpisodeShot[];
  aspect?: Aspect;
  soundtrack?: Soundtrack;
  onProgress?: (p: number) => void;
}): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  if (!opts.shots.length) throw new Error("Render at least one shot first.");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser can't record video.");
  const { mime, ext } = pickFormat();

  const ctx = new AudioContext();
  const videos: HTMLVideoElement[] = [];
  let raf = 0;
  try {
    for (const [i, s] of opts.shots.entries()) videos.push(await loadClip(s.clipUrl, i + 1));
    const voices = await Promise.all(
      opts.shots.map((s, i) => (s.voiceUrl ? loadVoice(ctx, s.voiceUrl, i + 1) : Promise.resolve(null))),
    );
    const music = opts.soundtrack ? await loadSoundtrack(ctx, opts.soundtrack.url) : null;
    const reel = opts.aspect === "9:16";
    const segs = planTimeline(videos.map((v, i) => ({ clip: v.duration, voice: voices[i]?.duration ?? 0 })), !reel);
    const total = segs[segs.length - 1].end;

    const { W, H } = canvasSize(opts.aspect ?? "16:9");
    const u = Math.min(W, H) / 720;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d", { alpha: false })!;
    const dest = ctx.createMediaStreamDestination();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((ok) => { rec.onstop = () => ok(new Blob(chunks, { type: mime.split(";")[0] })); });

    const card = (big: string, small: string) => {
      const bg = g.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#0B0B18"); bg.addColorStop(1, "#1A1405");
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.textAlign = "center"; g.fillStyle = "#F5F0E1";
      g.font = `bold ${Math.round(60 * u)}px system-ui, -apple-system, sans-serif`;
      wrap(g, big, W - 200 * u).slice(0, 4).forEach((l, i, a) => g.fillText(l, W / 2, H / 2 - (a.length - 1) * 36 * u + i * 72 * u));
      g.font = `${Math.round(24 * u)}px system-ui, -apple-system, sans-serif`; g.fillStyle = "#F0C94E";
      g.fillText(small, W / 2, H - 80 * u);
    };
    const frame = (v: HTMLVideoElement) => {
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      const f = coverFit(v.videoWidth, v.videoHeight, W, H);
      g.drawImage(v, f.x, f.y, f.w, f.h);
    };
    const subtitle = (text: string) => {
      g.font = `600 ${Math.round(30 * u)}px system-ui, -apple-system, sans-serif`; g.textAlign = "center";
      // A reel's captions sit above the platform's own caption and buttons.
      const base = H > W ? H * 0.72 : H - 60;
      const lines = wrap(g, text, W - 240 * u).slice(0, H > W ? 3 : 2);
      lines.forEach((l, i) => {
        const y = base - (lines.length - 1 - i) * 40 * u;
        g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(l, W / 2, y);
        g.fillStyle = "#FFFFFF"; g.fillText(l, W / 2, y);
      });
    };

    // Chrome stops sending audio frames while nothing is playing, which ends the
    // audio track at the last voice-over; a silent source keeps it episode-long.
    const carrier = ctx.createConstantSource();
    carrier.offset.value = 0;
    carrier.connect(dest);

    if (!reel) card(opts.title, "");
    await ctx.resume();
    const t0 = ctx.currentTime;
    carrier.start(t0);
    for (const seg of segs) {
      const voice = seg.shot !== undefined ? voices[seg.shot] : null;
      if (voice) {
        const src = ctx.createBufferSource();
        src.buffer = voice;
        src.connect(dest);
        src.start(t0 + seg.start);
      }
    }
    if (music) {
      const src = ctx.createBufferSource();
      src.buffer = music;
      const from = Math.min(Math.max(0, opts.soundtrack?.start ?? 0), Math.max(0, music.duration - 1));
      // Loop on what is left after the start point, not the whole track.
      src.loop = music.duration - from < total;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(MUSIC_FULL, t0);
      for (const seg of segs) {
        if (seg.shot === undefined || !voices[seg.shot]) continue;
        gain.gain.setTargetAtTime(MUSIC_DUCKED, t0 + seg.start, 0.08);
        gain.gain.setTargetAtTime(MUSIC_FULL, t0 + seg.start + voices[seg.shot]!.duration, 0.25);
      }
      // An episode fades out over its end card; a reel plays through, so the
      // music carries across the loop back to its first frame.
      if (!reel) gain.gain.setTargetAtTime(0, t0 + total - MUSIC_FADE_OUT, MUSIC_FADE_OUT / 4);
      src.connect(gain).connect(dest);
      src.start(t0, from, total);
    }
    rec.start(1000);

    await new Promise<void>((finish) => {
      let playing = -1;
      const draw = () => {
        const t = ctx.currentTime - t0;
        if (t >= total) return finish();
        const seg = segs.find((s) => t < s.end)!;
        if (seg.kind === "shot") {
          const i = seg.shot!;
          if (playing !== i) { playing = i; videos[i].currentTime = 0; void videos[i].play(); }
          frame(videos[i]);
          if (opts.shots[i].narration) subtitle(opts.shots[i].narration);
        } else {
          card(opts.title, seg.kind === "end" ? "Made with The Third Eye" : "");
        }
        // A reel cuts straight in and out, so its last frame loops into its first.
        const edge = Math.min(reel && seg.start === 0 ? FADE : t - seg.start, reel && seg.end === total ? FADE : seg.end - t);
        if (edge < FADE) { g.fillStyle = `rgba(0,0,0,${1 - edge / FADE})`; g.fillRect(0, 0, W, H); }
        opts.onProgress?.(t / total);
        raf = requestAnimationFrame(draw);
      };
      draw();
    });

    rec.stop();
    opts.onProgress?.(1);
    return { blob: await done, ext };
  } finally {
    cancelAnimationFrame(raf);
    for (const v of videos) { v.pause(); URL.revokeObjectURL(v.src); }
    await ctx.close().catch(() => {});
  }
}
