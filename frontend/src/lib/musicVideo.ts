// Client-side music-video generator — an audio-reactive visualizer rendered to a
// canvas and recorded (with the audio) into a downloadable WebM.
//
// Design notes (why it's built this way):
//   • Sync: we decode the clip into an AudioBuffer and drive playback with an
//     AudioBufferSourceNode started in the SAME tick as MediaRecorder.start().
//     That makes the audio and video tracks begin at the same instant — the old
//     approach started the recorder *before* an <audio> element actually began
//     producing sound, so the audio lagged the visuals.
//   • Seamless long songs: an AudioBufferSourceNode with loop=true is
//     sample-accurate and gapless (unlike <audio loop>). We also trim trailing
//     silence from the clip so a MusicGen-style fade-to-silence ending doesn't
//     leave a dead spot at every loop boundary — so the loop reads as one
//     continuous song instead of an obviously repeating clip.
//   • Quality: explicit high bitrate + 1080p (the browser's default bitrate is
//     conservative and produces blocky 720p).

// Recording longer than this in the browser exhausts memory, so we cap the
// rendered video and let the in-app player loop for the full session length.
const MAX_VIDEO_SECONDS = 180;

export interface VisualizerOptions {
  title?: string;
  onProgress?: (p: number) => void;
  /** Loop the clip to fill this many seconds (capped) — for long sessions. */
  loopToSeconds?: number;
}

/** Trim trailing (and leading) near-silence so a looped clip has no dead gap. */
function trimSilence(buf: AudioBuffer, ctx: BaseAudioContext): AudioBuffer {
  const ch0 = buf.getChannelData(0);
  const thresh = 0.005; // ~ -46 dBFS
  let start = 0, end = buf.length - 1;
  while (start < end && Math.abs(ch0[start]) < thresh) start++;
  while (end > start && Math.abs(ch0[end]) < thresh) end--;
  // Keep a little head/tail so we don't clip a soft attack/release.
  const pad = Math.floor(buf.sampleRate * 0.02);
  start = Math.max(0, start - pad);
  end = Math.min(buf.length - 1, end + pad);
  const len = end - start + 1;
  if (len <= 0 || len >= buf.length - pad) return buf; // nothing meaningful to trim
  const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(start, end + 1));
  }
  return out;
}

export async function generateVisualizerVideo(
  audioSrc: string,
  opts: VisualizerOptions = {},
): Promise<Blob> {
  if (typeof window === "undefined") throw new Error("client only");
  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  if (!AC || typeof MediaRecorder === "undefined") throw new Error("This browser can't record video.");

  // Decode the clip up-front so playback is sample-accurate and loopable.
  const resp = await fetch(audioSrc);
  if (!resp.ok) throw new Error("Could not load the audio for video.");
  const raw = await resp.arrayBuffer();

  const ctx = new AC();
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(raw.slice(0));
  } catch {
    await ctx.close().catch(() => {});
    throw new Error("This audio format can't be decoded for video in this browser.");
  }
  const clip = trimSilence(buffer, ctx);
  const clipDur = clip.duration;

  // How long to render: fill the requested session, but cap for the browser.
  const target = Math.min(
    Math.max(opts.loopToSeconds && opts.loopToSeconds > clipDur ? opts.loopToSeconds : clipDur, 1),
    MAX_VIDEO_SECONDS,
  );
  const willLoop = target > clipDur + 0.05;

  const source = ctx.createBufferSource();
  source.buffer = clip;
  source.loop = willLoop;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const dest = ctx.createMediaStreamDestination();
  source.connect(analyser);
  analyser.connect(dest); // record the audio; not routed to speakers (silent render)

  const canvas = document.createElement("canvas");
  canvas.width = 1920; canvas.height = 1080;
  const g = canvas.getContext("2d", { alpha: false })!;
  const FPS = 30;
  const canvasStream = canvas.captureStream(FPS);
  const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
  const rec = new MediaRecorder(mixed, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000, // ~8 Mbps 1080p — sharp, no blocky artefacts
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: "video/webm" })); });

  const bins = analyser.frequencyBinCount;
  const data = new Uint8Array(bins);
  const timeDom = new Uint8Array(analyser.fftSize);
  const title = opts.title || "";
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
  let raf = 0;
  let frame = 0;
  let startTs = 0;
  const draw = () => {
    frame++;
    analyser.getByteFrequencyData(data);
    analyser.getByteTimeDomainData(timeDom);
    const bass = (data.slice(0, 8).reduce((s, v) => s + v, 0) / 8) / 255; // low-end energy

    // Background: deep gradient that pulses gently with the bass.
    const bg = g.createRadialGradient(cx, cy, 60, cx, cy, Math.max(W, H) * 0.7);
    bg.addColorStop(0, `hsl(${(160 + frame * 0.4) % 360}, 45%, ${8 + bass * 10}%)`);
    bg.addColorStop(1, "#05050C");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // Circular spectrum — bars radiating from the centre.
    const ring = 220 + bass * 90;
    const n = 128;
    for (let i = 0; i < n; i++) {
      const v = data[Math.floor((i / n) * bins)] / 255;
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + frame * 0.002;
      const len = 18 + v * 360;
      const x1 = cx + Math.cos(ang) * ring, y1 = cy + Math.sin(ang) * ring;
      const x2 = cx + Math.cos(ang) * (ring + len), y2 = cy + Math.sin(ang) * (ring + len);
      g.strokeStyle = `hsl(${(150 + i * 2.2 + frame) % 360}, 80%, ${45 + v * 30}%)`;
      g.lineWidth = 4 + v * 6; g.lineCap = "round";
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }

    // Waveform ribbon across the middle.
    g.beginPath();
    for (let i = 0; i < timeDom.length; i++) {
      const x = (i / timeDom.length) * W;
      const y = cy + ((timeDom[i] - 128) / 128) * (H * 0.16);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(52,211,153,0.5)"; g.lineWidth = 3; g.stroke();

    // Title with a soft glow.
    g.textAlign = "center";
    g.fillStyle = "rgba(232,247,240,0.96)";
    g.shadowColor = "rgba(52,211,153,0.6)"; g.shadowBlur = 32;
    g.font = "bold 72px system-ui, -apple-system, sans-serif";
    g.fillText(title.slice(0, 40), cx, H - 96);
    g.shadowBlur = 0;
    g.textAlign = "left";

    if (opts.onProgress && startTs) opts.onProgress(Math.min(1, (performance.now() - startTs) / 1000 / target));
    raf = requestAnimationFrame(draw);
  };

  try {
    await ctx.resume();
    g.fillStyle = "#05050C"; g.fillRect(0, 0, W, H); // prime first frame
    // Start audio and recording in the same tick → tracks are aligned.
    startTs = performance.now();
    source.start();
    rec.start();
    draw();
    await new Promise<void>((res) => {
      const stopAt = startTs + target * 1000;
      const tick = () => {
        if (performance.now() >= stopAt) return res();
        setTimeout(tick, 100);
      };
      // Also honour the natural end when we're not looping.
      source.onended = () => res();
      tick();
    });
  } finally {
    cancelAnimationFrame(raf);
    try { source.stop(); } catch { /* already stopped */ }
    if (rec.state !== "inactive") rec.stop();
    try { await ctx.close(); } catch { /* noop */ }
  }
  return finished;
}
