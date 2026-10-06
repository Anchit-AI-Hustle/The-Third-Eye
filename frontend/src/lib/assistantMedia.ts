import { encrypt, decrypt } from "@/lib/crypto";
import { createPrediction, getPrediction, replicateConfigured, videoUrlFrom, audioUrlFrom } from "@/lib/replicate";

export type MediaKind = "image" | "music" | "video";

export async function startAssistantMedia(user: string | undefined, kind: MediaKind, prompt: string, options: { style?: string; size?: string } = {}) {
  if (!user) return { result: "Sign in before generating media." };
  if (!prompt.trim()) return { result: "Describe the media you want to generate." };
  if (!replicateConfigured()) return { result: "Media rendering is not configured. Set REPLICATE_API_TOKEN on the server. No media was generated." };
  if (!process.env.TOKEN_ENCRYPTION_KEY) return { result: "Media job delivery needs TOKEN_ENCRYPTION_KEY on the server. No job was started." };
  const aspect = options.size === "portrait" ? "9:16" : options.size === "landscape" || options.size === "wide" ? "16:9" : "1:1";
  const model = kind === "image" ? process.env.IMAGE_MODEL || "black-forest-labs/flux-schnell"
    : kind === "music" ? process.env.MUSIC_INSTRUMENTAL_MODEL || "meta/musicgen"
    : process.env.VIDEO_MODEL || "bytedance/seedance-1-lite";
  const input = kind === "image" ? { prompt: `${prompt}${options.style ? `, ${options.style}` : ""}`, aspect_ratio: aspect, output_format: "png" }
    : kind === "music" ? { prompt, duration: 30, model_version: "stereo-large" }
    : { prompt: prompt.slice(0, 1500), duration: 5, resolution: process.env.VIDEO_RESOLUTION || "480p", aspect_ratio: "16:9" };
  try {
    const job = await createPrediction(model, input);
    if (job.status === "failed" || job.status === "canceled") return { result: `${kind} generation ${job.status}. No output is available.` };
    const ticket = encrypt(JSON.stringify({ user, id: job.id, kind, expires: Date.now() + 7 * 86400_000 }));
    const url = `/generations/job?ticket=${encodeURIComponent(ticket!)}`;
    return { result: `${kind} job submitted (${job.status}). This is ${kind === "music" ? "a 30-second instrumental" : kind === "video" ? "a 5-second clip" : "an image"}; it is not complete until the job page confirms success. Include this exact link so the user can follow progress and download the result: [View ${kind} job](${url})` };
  } catch (error) { return { result: `Media generation failed: ${error instanceof Error ? error.message : "provider error"}. No completed output is available.` }; }
}

export async function assistantMediaStatus(user: string, ticket: string) {
  let job: { user: string; id: string; kind: MediaKind; expires: number };
  try { job = JSON.parse(decrypt(ticket) ?? "null"); } catch { throw new Error("Invalid job link"); }
  if (!job || job.user !== user || !(job.expires > Date.now()) || !["image", "music", "video"].includes(job.kind)) throw new Error("Job link is invalid or expired");
  const prediction = await getPrediction(job.id);
  const output = prediction.status === "succeeded" ? videoUrlFrom(prediction.output) ?? audioUrlFrom(prediction.output) : null;
  const url = output?.startsWith("https://") ? output : null;
  return { kind: job.kind, status: prediction.status, url, error: prediction.error ?? (prediction.status === "succeeded" && !url ? "Provider returned no downloadable output" : null) };
}
