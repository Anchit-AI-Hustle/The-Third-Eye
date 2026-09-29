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
 * rather than the line spilling into the next shot.
 */
export function planTimeline(shots: { clip: number; voice: number }[]): Segment[] {
  const segs: Segment[] = [{ kind: "title", start: 0, end: TITLE_SECONDS }];
  let t = TITLE_SECONDS;
  shots.forEach((s, i) => {
    const len = Math.max(s.clip, s.voice > 0 ? s.voice + VOICE_TAIL : 0);
    segs.push({ kind: "shot", start: t, end: t + len, shot: i });
    t += len;
  });
  segs.push({ kind: "end", start: t, end: t + END_SECONDS });
  return segs;
}

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
  return v;
}

async function loadVoice(ctx: AudioContext, url: string, n: number): Promise<AudioBuffer> {
  const res = await fetch(proxied(url));
  if (!res.ok) throw new Error(`Shot ${n}'s voice-over could not be loaded — voice it again and retry.`);
  return ctx.decodeAudioData(await res.arrayBuffer());
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
    const segs = planTimeline(videos.map((v, i) => ({ clip: v.duration, voice: voices[i]?.duration ?? 0 })));
    const total = segs[segs.length - 1].end;

    const W = 1280, H = 720;
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
      g.font = "bold 60px system-ui, -apple-system, sans-serif";
      wrap(g, big, W - 200).slice(0, 3).forEach((l, i, a) => g.fillText(l, W / 2, H / 2 - (a.length - 1) * 36 + i * 72));
      g.font = "24px system-ui, -apple-system, sans-serif"; g.fillStyle = "#F0C94E";
      g.fillText(small, W / 2, H - 80);
    };
    const frame = (v: HTMLVideoElement) => {
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      const k = Math.min(W / v.videoWidth, H / v.videoHeight);
      const w = v.videoWidth * k, h = v.videoHeight * k;
      g.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
    };
    const subtitle = (text: string) => {
      g.font = "600 30px system-ui, -apple-system, sans-serif"; g.textAlign = "center";
      const lines = wrap(g, text, W - 240).slice(0, 2);
      lines.forEach((l, i) => {
        const y = H - 60 - (lines.length - 1 - i) * 40;
        g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(l, W / 2, y);
        g.fillStyle = "#FFFFFF"; g.fillText(l, W / 2, y);
      });
    };

    // Chrome stops sending audio frames while nothing is playing, which ends the
    // audio track at the last voice-over; a silent source keeps it episode-long.
    const carrier = ctx.createConstantSource();
    carrier.offset.value = 0;
    carrier.connect(dest);

    card(opts.title, "");
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
        const edge = Math.min(t - seg.start, seg.end - t);
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
