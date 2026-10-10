#!/usr/bin/env node
// Records the Google OAuth verification demo for The Third Eye on a Mac:
// drives real Chrome through the live app, screen-records it with ffmpeg
// (the whole screen, so the address bar and client_id are in frame — a
// browser-only recording would crop them out), then adds spoken narration,
// burned-in captions and a zoom on the consent screen's address bar.
//
// From the repo root (installs, signs in once, then records):
//   TEST_EMAIL=you.test@gmail.com RECIPIENT=other@gmail.com npm run demo
// or the two halves: `npm run demo:setup`, then `npm run demo:record`.
//
// Needs: macOS, Google Chrome, `brew install ffmpeg`, and Terminal allowed under
// System Settings → Privacy & Security → Screen Recording. Any step the script
// cannot click on its own pauses and asks you to click it; the recording keeps
// running, so the take stays continuous. Passwords are only ever typed in
// `setup`, which is not recorded.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright-core";

const MODE = process.argv[2];
const APP = (process.env.APP_URL ?? "https://the-third-eye.anchit-tandon.com").replace(/\/$/, "");
const TEST_EMAIL = process.env.TEST_EMAIL;
const RECIPIENT = process.env.RECIPIENT;
const VOICE = process.env.VOICE ?? "Samantha";
const OUT = resolve(process.env.OUT ?? "out");
const PROFILE = process.env.PROFILE ?? join(homedir(), ".third-eye-demo-chrome");
// Address-bar region to enlarge on the consent screen, as fractions of the screen: x,y,w,h.
const ZOOM_BOX = (process.env.ZOOM_BOX ?? "0,0.03,0.6,0.09").split(",").map(Number);

const LINES = {
  intro: "This is The Third Eye, a personal assistant at the-third-eye dot anchit-tandon dot com. This video shows the OAuth consent flow and every Google permission the app uses: Gmail read-only, Gmail send, and read-only access to events on calendars I own.",
  signin: "Signing in only asks for my name and email. Gmail and Calendar are a separate, optional step that the user starts themselves.",
  connect: "In Settings, under Connections, I click Connect Google. This opens the OAuth consent screen under review.",
  clientId: "The address bar shows the client ID of project 5 2 9 5 5 3 3 0 8 9 7 6.",
  consent: "All services are expanded so each permission is readable. The app requests exactly three scopes: gmail dot readonly, gmail dot send, and calendar dot events dot owned dot readonly. Nothing else. I allow all three.",
  connected: "Back in the app, Settings shows Google connected with the three permissions that were granted.",
  sourceMail: "Here is an unread email in my Gmail inbox. The deadline, by Friday, is in the message body.",
  scan: "gmail dot readonly powers the Task Tracker. Scan now reads my unread mail from the last two days and turns action items into tasks. The deadline is in the body, so the app must read it. gmail dot metadata only returns headers and cannot do this.",
  search: "gmail dot readonly also lets the Assistant search my mail when I ask. That uses Gmail search queries, which gmail dot metadata does not allow. The app never modifies or deletes mail, and it does not store message bodies.",
  sendAsk: "gmail dot send lets the Assistant send an email I ask for. It drafts the message and shows me the recipient, subject and body.",
  sendConfirm: "Nothing is sent until I press Confirm.",
  sent: "Here is the effect on my Google account. The message is now in my Gmail Sent folder, sent from my own address. The app also uses gmail dot send to email me reminders and a daily task briefing I switch on. gmail dot send is the narrowest scope that can send.",
  calendarSource: "These are the events on my own Google Calendar this week.",
  calendar: "calendar dot events dot owned dot readonly lets the Assistant answer questions about my schedule. It lists events on calendars I own, with titles, times and locations, which free busy data does not include. It is read-only. The app never creates, edits or deletes events.",
  revoke: "Users can disconnect at any time. That revokes the token at Google and deletes it from our servers. That is every scope The Third Eye requests, and every feature that uses them. Thank you.",
};

const rl = createInterface({ input: process.stdin, output: process.stdout });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`\x1b[36m▶ ${m}\x1b[0m`);

function need(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); process.exit(1); }
}

async function launch() {
  return chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    viewport: null,
    // Google refuses sign-in in a browser that announces automation.
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--start-maximized", "--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"],
  });
}

// ─── setup: sign in to Google once, by hand, off camera ─────────────────────
async function setup() {
  need(TEST_EMAIL, "Set TEST_EMAIL to the Google test account.");
  const ctx = await launch();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://accounts.google.com/");
  log(`Sign in to Google as ${TEST_EMAIL} in the Chrome window (password + any prompts).`);
  log("Then open https://myaccount.google.com/connections and remove The Third Eye if it is listed, so the consent screen appears fresh.");
  await rl.question("Press Enter here when done… ");
  await ctx.close();
  log(`Saved. Chrome profile: ${PROFILE}`);
}

// ─── narration: rendered before recording so each line's length is known ────
function renderVoice() {
  need(spawnSync("which", ["say"]).status === 0, "macOS `say` not found — run this on a Mac.");
  const dir = join(OUT, "voice");
  mkdirSync(dir, { recursive: true });
  const dur = {};
  for (const [key, text] of Object.entries(LINES)) {
    const aiff = join(dir, `${key}.aiff`);
    spawnSync("say", ["-v", VOICE, "-r", "175", "-o", aiff, text], { stdio: "inherit" });
    const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", aiff], { encoding: "utf8" });
    dur[key] = Math.ceil(parseFloat(p.stdout) * 1000);
  }
  return dur;
}

function screenDevice() {
  const p = spawnSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { encoding: "utf8" });
  const m = (p.stderr ?? "").match(/\[(\d+)\] Capture screen 0/);
  need(m, "No screen capture device. Allow Terminal under Privacy & Security → Screen Recording, then reopen Terminal.");
  return process.env.SCREEN ?? m[1];
}

function startRecorder(file) {
  const ff = spawn("ffmpeg", ["-hide_banner", "-y", "-f", "avfoundation", "-capture_cursor", "1", "-framerate", "30",
    "-i", `${screenDevice()}:none`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", file],
  { stdio: ["pipe", "ignore", "pipe"] });
  return new Promise((ok, fail) => {
    let started = false;
    ff.stderr.on("data", (d) => {
      if (!started && /frame=\s*\d+/.test(String(d))) { started = true; ok({ ff, t0: Date.now() }); }
    });
    ff.on("exit", (c) => { if (!started) fail(new Error(`ffmpeg exited ${c} before recording started`)); });
  });
}

// ─── record ──────────────────────────────────────────────────────────────────
async function record() {
  need(TEST_EMAIL && RECIPIENT, "Set TEST_EMAIL (Google test account) and RECIPIENT (a second address you can open).");
  need(existsSync(PROFILE), "Run `npm run setup` first to sign in to Google.");
  need(spawnSync("which", ["ffmpeg"]).status === 0, "Install ffmpeg: brew install ffmpeg");
  mkdirSync(OUT, { recursive: true });

  log("Rendering narration…");
  const dur = renderVoice();

  const ctx = await launch();
  const app = ctx.pages()[0] ?? (await ctx.newPage());
  app.on("dialog", (d) => d.accept());
  await app.goto(APP);
  await sleep(1500);

  const raw = join(OUT, "raw.mp4");
  const { ff, t0 } = await startRecorder(raw);
  const timeline = [];
  const marks = {};
  const now = () => Date.now() - t0;
  const say = async (key) => { timeline.push({ key, at: now() }); await sleep(dur[key] + 400); };

  // Clicks the first locator that appears; otherwise asks you to click it.
  // The recording keeps running, so a manual click is still one continuous take.
  const click = async (page, label, ...locs) => {
    for (const l of locs) {
      try { await l.first().waitFor({ state: "visible", timeout: 6000 }); await l.first().click(); return; } catch { /* next */ }
    }
    await rl.question(`\x1b[33m⚠ Please click "${label}" in Chrome, then press Enter… \x1b[0m`);
  };
  // For screens Google shows only sometimes (account chooser, re-consent).
  const maybe = async (loc, ms = 5000) => {
    try { await loc.first().waitFor({ state: "visible", timeout: ms }); await loc.first().click(); } catch { /* not shown */ }
  };
  const waitFor = async (page, label, loc, timeout = 45000) => {
    try { await loc.first().waitFor({ state: "visible", timeout }); }
    catch { await rl.question(`\x1b[33m⚠ Waiting for "${label}". When it's on screen, press Enter… \x1b[0m`); }
  };
  const ask = async (text) => {
    await app.goto(`${APP}/assistant`);
    const box = app.getByPlaceholder(/Message JARVIS|Or type here/);
    await waitFor(app, "Assistant message box", box);
    await box.click();
    await box.pressSequentially(text, { delay: 35 });
    await box.press("Enter");
  };

  try {
    // 1 — the app
    log("Scene 1: the app");
    await app.mouse.wheel(0, 900); await sleep(1200); await app.mouse.wheel(0, -900);
    await say("intro");

    // 2 — sign-in, identity only
    log("Scene 2: sign-in");
    await app.goto(`${APP}/auth/signin`);
    await click(app, "Continue with Google", app.getByRole("button", { name: /Continue with Google/ }));
    await maybe(app.getByText(TEST_EMAIL, { exact: false }));
    await maybe(app.getByRole("button", { name: /^(Continue|Allow)$/ }));
    await say("signin");
    await app.waitForURL(new RegExp(`^${APP.replace(/[.]/g, "\\.")}`), { timeout: 60000 }).catch(() => {});

    // 3 — the consent flow under review
    log("Scene 3: consent");
    await app.goto(`${APP}/settings`);
    const card = app.getByText("// Connections");
    await waitFor(app, "Connections card", card);
    await card.scrollIntoViewIfNeeded();
    const disconnect = app.getByRole("button", { name: /^Disconnect$/ });
    if (await disconnect.first().isVisible().catch(() => false)) { await disconnect.first().click(); await sleep(2500); await app.reload(); }
    await say("connect");
    await click(app, "Connect Google", app.getByRole("link", { name: /Connect Google|Reconnect/ }));
    await maybe(app.getByText(TEST_EMAIL, { exact: false }));
    // Testing-mode apps show Google's "hasn't verified this app" notice first.
    if (await app.getByText(/hasn.t verified this app/i).first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await click(app, "Continue (unverified notice)", app.getByRole("button", { name: /^Continue$/ }), app.getByText(/^Continue$/));
    }
    await waitFor(app, "the consent screen", app.getByText(/wants (access|additional access)|Select all|Send email on your behalf/i));
    marks.zoomFrom = now();
    await say("clientId");
    marks.zoomTo = now();
    for (const t of [/See all|Show all|more services/i]) {
      const more = app.getByText(t);
      if (await more.first().isVisible().catch(() => false)) await more.first().click();
    }
    const selectAll = app.getByRole("checkbox", { name: /Select all/i });
    if (await selectAll.first().isVisible().catch(() => false)) await selectAll.first().check();
    for (const t of [/View your email messages|Read.*email/i, /Send email on your behalf/i, /events on Google calendars you own|calendars you own/i]) {
      const line = app.getByText(t);
      if (await line.first().isVisible().catch(() => false)) { await line.first().scrollIntoViewIfNeeded(); await line.first().hover(); await sleep(2200); }
    }
    await say("consent");
    await click(app, "Continue / Allow", app.getByRole("button", { name: /^(Continue|Allow)$/ }));
    await app.waitForURL(/\/settings/, { timeout: 60000 }).catch(() => {});
    await waitFor(app, "Connected", app.getByText(/^Connected$|Connected/));
    await app.getByText("// Connections").scrollIntoViewIfNeeded().catch(() => {});
    await say("connected");

    // 4 — gmail.readonly: source mail, Scan now, Assistant search
    log("Scene 4: gmail.readonly");
    const mail = await ctx.newPage();
    await mail.goto(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent('subject:"Q3 report" in:inbox')}`);
    const row = mail.locator("tr.zA").filter({ hasText: /Q3 report/i });
    await click(mail, "the Q3 report email", row);
    await say("sourceMail");
    await click(mail, "Mark as unread", mail.getByRole("button", { name: /Mark as unread/i }));
    await app.bringToFront();
    await app.goto(`${APP}/tasks`);
    const panel = app.getByText("Live Capture & Sources");
    await waitFor(app, "Live Capture & Sources", panel);
    if (!(await app.getByRole("button", { name: /Scan now/ }).first().isVisible().catch(() => false))) await panel.first().click();
    await click(app, "Scan now", app.getByRole("button", { name: /Scan now/ }));
    await waitFor(app, "the scan result", app.getByText(/Gmail: \d+ new|Scan complete/));
    await say("scan");
    await app.mouse.wheel(0, 600); await sleep(2500);
    await ask("Do I have any email about the Q3 report? Summarise it.");
    await sleep(4000);
    await say("search");

    // 5 — gmail.send, then the Sent folder as proof in the account
    log("Scene 5: gmail.send");
    await ask(`Email ${RECIPIENT} with subject "Q3 report" saying the report will be attached by Friday.`);
    await waitFor(app, "the Confirm card", app.getByText("Confirm before I act"));
    await say("sendAsk");
    await say("sendConfirm");
    await click(app, "Confirm & do it", app.getByRole("button", { name: /Confirm & do it/ }));
    await sleep(5000);
    await mail.bringToFront();
    await mail.goto("https://mail.google.com/mail/u/0/#sent");
    await click(mail, "the newest Sent message", mail.locator("tr.zA").filter({ hasText: /Q3 report/i }));
    await say("sent");

    // 6 — calendar.events.owned.readonly
    log("Scene 6: calendar");
    await mail.goto("https://calendar.google.com/calendar/u/0/r/week");
    await sleep(4000);
    await say("calendarSource");
    await app.bringToFront();
    await ask("What's on my calendar this week?");
    await sleep(9000);
    await say("calendar");

    // 7 — revoke
    log("Scene 7: revoke");
    await app.goto(`${APP}/settings`);
    await app.getByText("// Connections").scrollIntoViewIfNeeded().catch(() => {});
    await click(app, "Disconnect", app.getByRole("button", { name: /^Disconnect$/ }));
    await waitFor(app, "Disconnected", app.getByText(/Disconnected\. Access was revoked/), 20000);
    await say("revoke");
  } finally {
    ff.stdin.write("q");
    await new Promise((r) => ff.on("exit", r));
    await ctx.close();
    rl.close();
  }

  writeFileSync(join(OUT, "timeline.json"), JSON.stringify({ timeline, marks }, null, 2));
  assemble(timeline, marks);
}

// ─── assembly: narration, captions, address-bar zoom ────────────────────────
const srtTime = (ms) => {
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
};

function captions(timeline, durOf) {
  // One caption per sentence, timed across the line's spoken length.
  let n = 0;
  return timeline.flatMap(({ key, at }) => {
    const parts = LINES[key].match(/[^.]+[.]?/g).map((s) => s.trim()).filter(Boolean);
    const total = parts.reduce((a, p) => a + p.length, 0);
    let t = at;
    return parts.map((p) => {
      const len = Math.round((durOf(key) * p.length) / total);
      const block = `${++n}\n${srtTime(t)} --> ${srtTime(t + len)}\n${p.replace(/ dot /g, ".").replace(/(\d) (?=\d)/g, "$1")}\n`;
      t += len;
      return block;
    });
  }).join("\n");
}

function assemble(timeline, marks) {
  const voice = join(OUT, "voice");
  const durOf = (key) => {
    const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(voice, `${key}.aiff`)], { encoding: "utf8" });
    return Math.round(parseFloat(p.stdout) * 1000);
  };
  writeFileSync(join(OUT, "captions.srt"), captions(timeline, durOf));

  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(OUT, "raw.mp4")], { encoding: "utf8" });
  const [W, H] = probe.stdout.trim().split(",").map(Number);
  const [zx, zy, zw, zh] = ZOOM_BOX;
  const cw = Math.round(W * zw), ch = Math.round(H * zh);
  const outW = Math.round(W * 0.9), outH = Math.round((ch * outW) / cw / 2) * 2;
  const a = (marks.zoomFrom ?? 0) / 1000, b = (marks.zoomTo ?? 0) / 1000 + 2;

  const inputs = ["-i", "raw.mp4", ...timeline.flatMap(({ key }) => ["-i", join("voice", `${key}.aiff`)])];
  const delays = timeline.map(({ at }, i) => `[${i + 1}:a]adelay=${at}|${at}[a${i}]`).join(";");
  const mix = `${timeline.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timeline.length}:duration=longest:normalize=0[aout]`;
  const video = [
    "[0:v]split[base][src]",
    `[src]crop=${cw}:${ch}:${Math.round(W * zx)}:${Math.round(H * zy)},scale=${outW}:${outH}[zoom]`,
    `[base][zoom]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'[zoomed]`,
    "[zoomed]scale=1920:-2,subtitles=captions.srt:force_style='FontName=Helvetica,FontSize=16,BorderStyle=3,Outline=1,Shadow=0,MarginV=36'[vout]",
  ].join(";");
  const args = ["-hide_banner", "-y", ...inputs, "-filter_complex", `${video};${delays};${mix}`,
    "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "the-third-eye-oauth-demo.mp4"];
  log("Assembling the final video…");
  const r = spawnSync("ffmpeg", args, { cwd: OUT, stdio: "inherit" });
  need(r.status === 0, "ffmpeg assembly failed (see above).");
  log(`Done: ${join(OUT, "the-third-eye-oauth-demo.mp4")}`);
  log("Watch it once, then upload to YouTube as Unlisted and paste the link into Data Access and your reply.");
}

if (MODE === "setup") await setup();
else if (MODE === "record") await record();
else if (MODE === "assemble") {
  const { timeline, marks } = JSON.parse(readFileSync(join(OUT, "timeline.json"), "utf8"));
  assemble(timeline, marks);
  rl.close();
} else {
  console.log("Usage: node record-demo.mjs setup | record | assemble");
  rl.close();
}
