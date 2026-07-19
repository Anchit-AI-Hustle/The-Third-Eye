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
  const title = opts.title || "";
  let raf = 0;
  const t0 = performance.now();
  const draw = () => {
    analyser.getByteFrequencyData(data);
    // Background
    g.fillStyle = "#07070F"; g.fillRect(0, 0, canvas.width, canvas.height);
    // Radial-ish bar spectrum
    const bars = bins; const bw = canvas.width / bars;
    for (let i = 0; i < bars; i++) {
      const v = data[i] / 255;
      const h = v * canvas.height * 0.75;
      g.fillStyle = `hsl(${150 + i * 1.2}, 70%, ${35 + v * 30}%)`;
      g.fillRect(i * bw, canvas.height - h, Math.max(1, bw * 0.7), h);
    }
    // Title
    g.fillStyle = "rgba(232,247,240,0.95)"; g.font = "bold 44px system-ui, sans-serif";
    g.fillText(title.slice(0, 40), 48, 80);
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
