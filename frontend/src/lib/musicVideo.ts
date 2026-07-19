// Client-side music-video generator — an audio-reactive visualizer rendered to a
// canvas and recorded (with the audio) into a downloadable WebM. Ports the spirit
// of MusicGenAI's canvas + MediaRecorder video-generator into the browser.
// The audio must be same-origin (use /api/tools/music/proxy) so Web Audio can
// analyse it without cross-origin tainting.

export async function generateVisualizerVideo(
  audioSrc: string,
  opts: { title?: string; onProgress?: (p: number) => void } = {},
): Promise<Blob> {
  if (typeof window === "undefined") throw new Error("client only");
  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  if (!AC || typeof MediaRecorder === "undefined") throw new Error("This browser can't record video.");

  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.src = audioSrc;
  await new Promise<void>((res, rej) => {
    audio.onloadedmetadata = () => res();
    audio.onerror = () => rej(new Error("Could not load the audio for video."));
  });
  const duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 20;

  const ctx = new AC();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const dest = ctx.createMediaStreamDestination();
  source.connect(analyser);
  analyser.connect(dest); // record the audio; not routed to speakers (silent render)

  const canvas = document.createElement("canvas");
  canvas.width = 1280; canvas.height = 720;
  const g = canvas.getContext("2d")!;
  const canvasStream = canvas.captureStream(30);
  const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
  const rec = new MediaRecorder(mixed, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: "video/webm" })); });

  const bins = analyser.frequencyBinCount;
  const data = new Uint8Array(bins);
  const time = new Uint8Array(analyser.fftSize);
  const title = opts.title || "";
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
  let raf = 0;
  let frame = 0;
  const t0 = performance.now();
  const draw = () => {
    frame++;
    analyser.getByteFrequencyData(data);
    analyser.getByteTimeDomainData(time);
    const bass = (data.slice(0, 8).reduce((s, v) => s + v, 0) / 8) / 255; // low-end energy

    // Background: deep gradient that pulses gently with the bass.
    const bg = g.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.7);
    bg.addColorStop(0, `hsl(${(160 + frame * 0.4) % 360}, 45%, ${8 + bass * 10}%)`);
    bg.addColorStop(1, "#05050C");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // Circular spectrum — bars radiating from the centre.
    const ring = 150 + bass * 60;
    const n = 96;
    for (let i = 0; i < n; i++) {
      const v = data[Math.floor((i / n) * bins)] / 255;
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + frame * 0.002;
      const len = 12 + v * 240;
      const x1 = cx + Math.cos(ang) * ring, y1 = cy + Math.sin(ang) * ring;
      const x2 = cx + Math.cos(ang) * (ring + len), y2 = cy + Math.sin(ang) * (ring + len);
      g.strokeStyle = `hsl(${(150 + i * 2.2 + frame) % 360}, 80%, ${45 + v * 30}%)`;
      g.lineWidth = 3 + v * 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }

    // Waveform ribbon across the middle.
    g.beginPath();
    for (let i = 0; i < time.length; i++) {
      const x = (i / time.length) * W;
      const y = cy + ((time[i] - 128) / 128) * (H * 0.16);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(52,211,153,0.5)"; g.lineWidth = 2; g.stroke();

    // Title with a soft glow.
    g.textAlign = "center";
    g.fillStyle = "rgba(232,247,240,0.96)";
    g.shadowColor = "rgba(52,211,153,0.6)"; g.shadowBlur = 24;
    g.font = "bold 52px system-ui, -apple-system, sans-serif";
    g.fillText(title.slice(0, 40), cx, H - 70);
    g.shadowBlur = 0;
    g.textAlign = "left";

    if (opts.onProgress) opts.onProgress(Math.min(1, (performance.now() - t0) / 1000 / duration));
    raf = requestAnimationFrame(draw);
  };

  try {
    await ctx.resume();
    rec.start();
    draw();
    await audio.play();
    await new Promise<void>((res) => {
      audio.onended = () => res();
      setTimeout(res, (duration + 1.5) * 1000); // safety stop
    });
  } finally {
    cancelAnimationFrame(raf);
    if (rec.state !== "inactive") rec.stop();
    try { await ctx.close(); } catch { /* noop */ }
  }
  return finished;
}
