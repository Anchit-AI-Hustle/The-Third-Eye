#!/usr/bin/env node
// Post-render structural checks. Passing these does NOT substitute for a human
// viewing the actual OAuth consent, Gmail Sent and Calendar footage.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.env.OUT ?? join(DIR, "out"));
const VIDEO = join(OUT, "the-third-eye-oauth-demo.mp4");
const MANIFEST = join(OUT, "evidence-manifest.json");
const SHEET = join(OUT, "video-review-contact-sheet.jpg");
const EXPECTED = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events.owned.readonly",
];
const SCREENSHOTS = [
  "evidence-google-consent.png",
  "evidence-gmail-task.png",
  "evidence-gmail-sent.png",
  "evidence-calendar-source.png",
  "evidence-calendar-assistant.png",
];
const REQUIRED_SCENES = [
  "app_identity",
  "oauth_consent",
  "oauth_granted",
  "gmail_read",
  "gmail_send",
  "calendar_read",
];
const problems = [];
const check = (pass, message) => { if (!pass) problems.push(message); };
const run = (command, args) => spawnSync(command, args, { encoding: "utf8" });

if (!existsSync(VIDEO)) problems.push("The final video does not exist.");
if (!existsSync(MANIFEST)) problems.push("The current run's evidence manifest does not exist.");

let evidence = null;
let started = NaN;
if (existsSync(MANIFEST)) {
  try {
    evidence = JSON.parse(readFileSync(MANIFEST, "utf8"));
    started = Date.parse(evidence.startedAt);
    check(Number.isFinite(started), "Evidence manifest has no valid run start time.");
    check(EXPECTED.every((s) => evidence.expectedScopes?.includes(s)),
      "Evidence manifest does not include every required feature scope.");
    const scenes = evidence.evidence ?? [];
    for (const name of REQUIRED_SCENES)
      check(scenes.some((e) => e.scene === name), `Missing verified recording scene: ${name}`);
    for (let i = 1; i < scenes.length; i++)
      check(scenes[i].seconds >= scenes[i - 1].seconds,
        `Scene timeline is not monotonic at ${scenes[i].scene}`);
    const oauth = scenes.find((e) => e.scene === "oauth_consent");
    check(oauth?.detail?.clientId?.startsWith("529553308976-"),
      "The actual Google OAuth client ID was not observed in the recorded consent flow.");
    check(scenes.some((e) => e.scene === "oauth_granted" && e.detail?.connected === true),
      "Google's callback did not result in a confirmed usable connection.");
    const sent = scenes.find((e) => e.scene === "gmail_send");
    check(sent?.detail?.subject?.includes(evidence.runTag),
      "The Gmail Sent proof does not use this recording's unique subject.");
    check(!!scenes.find((e) => e.scene === "calendar_read")?.detail?.eventTitle,
      "No explicit Google Calendar event was verified against the Assistant.");
  } catch (err) { problems.push(`Cannot parse evidence manifest: ${err.message}`); }
}

for (const file of SCREENSHOTS) {
  const path = join(OUT, file);
  check(existsSync(path), `Missing footage QA screenshot: ${file}`);
  if (existsSync(path)) {
    const st = statSync(path);
    check(st.size > 1000, `QA screenshot appears empty: ${file}`);
    if (Number.isFinite(started)) check(st.mtimeMs >= started - 2000,
      `QA screenshot is stale from an earlier recording: ${file}`);
  }
}
let probe = null;
if (existsSync(VIDEO)) {
  const p = run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", VIDEO]);
  if (p.status !== 0) problems.push(`Video container is not playable: ${p.stderr}`);
  else {
    try { probe = JSON.parse(p.stdout); }
    catch { problems.push("ffprobe did not return valid media metadata."); }
  }
}
if (probe) {
  const duration = Number(probe.format?.duration);
  const v = probe.streams?.find((x) => x.codec_type === "video");
  const a = probe.streams?.find((x) => x.codec_type === "audio");
  check(duration >= 60 && duration <= 900, `Recording should last 1–15 minutes; actual duration: ${duration.toFixed(1)} seconds.`);
  check(!!v && v.width >= 1280 && v.height >= 720,
    `Recording must be legible at >=1280x720; current size: ${v?.width}x${v?.height}`);
  check(!!a, "Recording has no spoken audio track.");
  if (evidence?.evidence?.length)
    check(evidence.evidence.every((e) => e.seconds >= 0 && e.seconds < duration),
      "One or more scene timestamps fall outside the MP4.");
  if (Number.isFinite(started))
    check(statSync(VIDEO).mtimeMs >= started - 2000, "Final MP4 is stale from an earlier run.");
}

// A contact sheet helps the reviewer find blank/irrelevant scenes. It does not
// prove that sensitive Google grants worked: inspect the complete MP4 as well.
if (problems.length === 0) {
  const thumbs = run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-i", VIDEO, "-vf", "fps=1/18,scale=480:-2,tile=4x4", "-frames:v", "1", SHEET]);
  check(thumbs.status === 0 && existsSync(SHEET),
    `Could not generate a contact sheet: ${thumbs.stderr}`);
}

const report = {
  structuralQC: problems.length === 0 ? "pass" : "fail",
  evaluatedAt: new Date().toISOString(),
  video: VIDEO,
  contactSheet: existsSync(SHEET) ? SHEET : null,
  durationSeconds: Number(probe?.format?.duration ?? 0),
  runTag: evidence?.runTag ?? null,
  verifiedScenes: (evidence?.evidence ?? []).map((e) => e.scene),
  manualReviewRequired: true,
  problems,
};
writeFileSync(join(OUT, "video-qc.json"), JSON.stringify(report, null, 2));
if (problems.length) {
  console.error("\n✗ OAuth demo structural quality control failed:");
  for (const problem of problems) console.error("  - " + problem);
  process.exit(1);
}
console.log("\n✓ Media and scene-evidence structural quality checks passed.");
console.log("Review the complete MP4 and contact sheet before submitting anything to Google.");
console.log("Contact sheet: " + SHEET);
if (process.platform === "darwin") run("open", [SHEET]);
