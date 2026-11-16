"use client";

import { downsample, encodeWav, PcmClip, TARGET_RATE } from "@/lib/pcmClip";

export interface SpeechCaptureOptions {
  onSegment: (audio: Blob) => void;
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: unknown) => void;
  onTrackEnded?: () => void;
  preRollMs?: number;
  postRollMs?: number;
}

export interface SpeechCapture { stop: () => void }

export async function transcribeSpeechSegment(audio: Blob, lang?: string): Promise<string> {
  if (audio.size < 1000) return "";
  const form = new FormData();
  form.append("audio", audio, "speech.wav");
  if (lang) form.append("lang", lang);
  const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: AbortSignal.timeout(28_000) });
  if (!response.ok) throw new Error(`Transcription failed (${response.status}).`);
  const data = await response.json();
  return typeof data?.text === "string" ? data.text.trim() : "";
}

export async function startSpeechCapture(options: SpeechCaptureOptions): Promise<SpeechCapture> {
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) throw new Error("Web Audio is not supported by this browser.");
    context = new Context();
    if (context.state === "suspended") await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const processor = context.createScriptProcessor(2048, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);

    let active = true;
    let speaking = false;
    let stopCapture = () => {};
    let floor = 0.003;
    let aboveFrames = 0;
    let speechFrames = 0;
    let silenceSince = 0;
    const preRoll = Math.round(context.sampleRate * (options.preRollMs ?? 350) / 1000);
    const clip = new PcmClip(context.sampleRate, preRoll);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const sampleSpeech = () => {
      if (!active) return;
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      let crossings = 0;
      for (let i = 1; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i] - 128) / 128);
        if ((samples[i] >= 128) !== (samples[i - 1] >= 128)) crossings++;
      }
      const zcr = crossings / samples.length;
      const threshold = Math.max(0.012, floor * 2.5);
      const voiced = peak >= threshold && zcr >= 0.015 && zcr <= 0.38;
      if (!speaking) floor = floor * 0.98 + peak * 0.02;
      if (voiced) {
        aboveFrames++;
        if (!speaking && aboveFrames >= 2) {
          speaking = true;
          clip.start();
          speechFrames = 0;
          options.onSpeechStart?.();
        }
        if (speaking) { speechFrames++; silenceSince = 0; }
      } else {
        aboveFrames = 0;
        if (speaking) {
          if (!silenceSince) silenceSince = Date.now();
          const pause = options.postRollMs ?? 650;
          if (Date.now() - silenceSince >= pause) {
            if (speechFrames >= 8 && clip.recording) {
              options.onSegment(encodeWav(downsample(clip.stop(), context!.sampleRate, TARGET_RATE), TARGET_RATE));
            } else clip.drop();
            speaking = false;
            speechFrames = 0;
            silenceSince = 0;
            options.onSpeechEnd?.();
          }
        }
      }
      if (++frame % 4 === 0) options.onLevel?.(Math.min(100, Math.round(peak * 140)));
    };
    processor.onaudioprocess = (event) => {
      if (!active) return;
      const input = event.inputBuffer.getChannelData(0);
      clip.push(new Float32Array(input));
      event.outputBuffer.getChannelData(0).fill(0);
    };
    const timer = setInterval(sampleSpeech, 32);
    const ended = () => {
      if (!active) return;
      stopCapture();
      options.onTrackEnded?.();
    };
    stream.getTracks().forEach((track) => track.addEventListener("ended", ended));

    const capture: SpeechCapture = {
      stop: () => {
        if (!active) return;
        if (speaking && speechFrames >= 8 && clip.recording) {
          options.onSegment(encodeWav(downsample(clip.stop(), context!.sampleRate, TARGET_RATE), TARGET_RATE));
          options.onSpeechEnd?.();
        }
        active = false;
        clearInterval(timer);
        processor.onaudioprocess = null;
        processor.disconnect(); source.disconnect(); analyser.disconnect(); mute.disconnect();
        stream?.getTracks().forEach((track) => track.removeEventListener("ended", ended));
        stream?.getTracks().forEach((track) => track.stop());
        void context?.close();
        options.onLevel?.(0);
      },
    };
    stopCapture = capture.stop;
    return capture;
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    await context?.close().catch(() => {});
    options.onError?.(error);
    throw error;
  }
}
