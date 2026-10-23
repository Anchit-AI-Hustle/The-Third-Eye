import Link from "next/link";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Privacy note - The Third Eye",
  description:
    "In plain words: what The Third Eye captures from uploads, the camera and the microphone, whether it leaves your device, where it is stored, for how long, and how to delete it.",
  path: "/privacy",
});

type Row = { id: string; what: string; captured: string; leaves: string; stored: string; remove: string };

const ROWS: Row[] = [
  {
    id: "chat-files",
    what: "Files attached to an assistant message (paperclip, drag and drop, paste)",
    captured: "The whole file: images, PDFs, text or code, up to 3 MB.",
    leaves:
      "Yes. Sent to our server and on to an AI provider to answer the message - Google Gemini first, and for text files possibly another provider in our fallback list.",
    stored: "The file itself is not kept. The chat saves its file name, and the conversation is kept in your account.",
    remove: "Delete the chat from the Chats panel.",
  },
  {
    id: "project-files",
    what: "Project files (Chats panel → project → + Files)",
    captured: "The whole file, up to 3 MB per project.",
    leaves: "Yes. Stored on our server and sent to the AI provider with every message in that project.",
    stored: "The full file, in your account's database, until you remove it.",
    remove: "Remove the file and save, or delete the project.",
  },
  {
    id: "camera",
    what: "Camera and screen (Analyze camera / Analyze screen in the assistant)",
    captured: "One still frame (JPEG, up to 1280 px wide). The camera or screen share stops straight after.",
    leaves: "Yes. Sent to our server and to an AI provider to describe it - Google Gemini, OpenAI or OpenRouter.",
    stored: "The image is not kept. Your question and the answer are saved in the chat.",
    remove: "Delete the chat.",
  },
  {
    id: "microphone",
    what: "Microphone in the assistant (dictate, Call mode and the floating voice button)",
    captured: "What you say while the mic is on.",
    leaves:
      "Yes. Your browser's own speech recognition turns it into text - in Chrome and Edge that runs on the browser maker's servers. Short audio clips are also sent to our server for transcription by Groq, OpenAI or Google.",
    stored: "Audio is not kept. The transcript is saved as your chat message.",
    remove: "Delete the chat.",
  },
  {
    id: "wake-word",
    what: "Wake word (the ear toggle)",
    captured: "Listens continuously while switched on, to hear its name.",
    leaves:
      "Yes. Browser speech recognition while the tab is open. When the tab is in the background, or the browser has no speech recognition, 6-second clips with sound in them go to our server for transcription.",
    stored: "Nothing is kept.",
    remove: "Switch the ear off.",
  },
  {
    id: "live-capture",
    what: "Live Capture (Tasks → Start listening)",
    captured: "A running transcript of the conversation around you while it is on. If you set microphone access to \"always\", it starts when the app opens.",
    leaves: "Yes. Browser speech recognition, then every 20 seconds the transcript text goes to an AI provider to pick out tasks.",
    stored:
      "Tasks it finds are added to your account. The full transcript and summary stay in this browser only (the last 100 sessions).",
    remove: "Undo any added task, or delete the session.",
  },
  {
    id: "life-log",
    what: "Life Log (Start recording the day)",
    captured: "Continuous audio in 45-second chunks while recording.",
    leaves:
      "Partly. Raw audio never leaves the device. Chunks with speech are sent for transcription, and the text goes to an AI provider to build the day's events and diary.",
    stored: "Audio stays in this browser. Transcripts, events and the diary are kept in this browser and in your account.",
    remove: "Delete this day - removes the audio, the local copy and the saved copy.",
  },
  {
    id: "finance-voice",
    what: "Voice entry in Finance",
    captured: "One spoken sentence.",
    leaves: "Browser speech recognition fills the box. The text goes to an AI provider only when you press parse.",
    stored: "Only the expense you save.",
    remove: "Delete the expense.",
  },
  {
    id: "documents",
    what: "Knowledge uploads and Upload Documents / Upload Photos / Sync Folder in Settings",
    captured:
      "Text from your files. PDF and Word text is pulled out in your browser; for images only a short description is kept, not the picture.",
    leaves:
      "Yes. The text is stored on our server and split into passages that are sent to Google's embedding service so the assistant can search them. Documents are also sent with your assistant messages.",
    stored: "Full text and searchable passages, in your account, until you delete the document.",
    remove: "The trash icon on the document removes it and its passages.",
  },
  {
    id: "contacts",
    what: "Contacts import (.vcf or CSV)",
    captured: "Names and details in the file.",
    leaves: "Yes. Saved to your account and sent with assistant messages so it can find people.",
    stored: "In this browser and in your account.",
    remove: "Remove the contact.",
  },
  {
    id: "photo-sync",
    what: "Sync All Photos (iPhone app only)",
    captured: "Small thumbnails with the time and location each photo was taken.",
    leaves: "Yes. Stored on our server.",
    stored: "In your account, until you delete your account.",
    remove: "There is no per-photo delete yet - delete your account or email us.",
  },
  {
    id: "on-device",
    what: "Task CSV import and video soundtracks",
    captured: "The file you pick.",
    leaves: "No. Read in your browser. Imported tasks are saved like any task you type.",
    stored: "Soundtracks are not stored. Tasks are kept until you delete them.",
    remove: "Delete the task.",
  },
];

export default function PrivacyNotePage() {
  return (
    <div className="min-h-screen bg-background-base text-text-primary">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-8">
        <main id="main-content" className="py-12">
          <Link href="/" className="font-mono text-sm text-text-muted transition-colors hover:text-text-secondary">
            ← The Third Eye
          </Link>

          <h1 className="mt-8 font-display text-2xl font-semibold">Privacy note</h1>
          <p className="mt-2 font-mono text-sm text-text-muted">Checked against the code: October 2026</p>

          <div className="mt-8 space-y-3 text-sm leading-relaxed text-text-secondary">
            <p>
              The short version, for anything you upload, show the camera or say to the microphone once signed in:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <span className="text-text-primary">Most of it leaves your device.</span> The assistant runs on our server
                and on outside AI providers (Google, OpenAI, Groq and others), not on your phone or computer. The
                exceptions are named below.
              </li>
              <li>
                <span className="text-text-primary">Raw camera images and voice audio are not stored.</span> The text
                that comes out of them - transcripts, answers, tasks - is.
              </li>
              <li>
                <span className="text-text-primary">Nothing expires on its own.</span> What is stored stays in your
                account&apos;s database (Supabase Postgres, encrypted at rest) until you delete it or your account.
              </li>
              <li>
                <span className="text-text-primary">The assistant remembers conversations.</span> Each exchange (up to
                4,000 characters) is saved as text with a search index so it can recall it later. These memories have
                no per-item delete yet; they go when you delete your account.
              </li>
              <li>
                <span className="text-text-primary">The demo captures nothing.</span>{" "}
                <Link href="/demo" className="text-accent-blue hover:underline">
                  The demo
                </Link>{" "}
                uses built-in sample data, and nothing you do there is sent to our server or an AI provider.
              </li>
            </ul>
          </div>

          <h2 className="mt-12 font-display text-lg font-semibold">Control by control</h2>
          <div className="mt-4 space-y-4">
            {ROWS.map((r) => (
              <section
                key={r.id}
                id={r.id}
                aria-labelledby={`${r.id}-h`}
                className="scroll-mt-6 rounded-card border border-border-default bg-background-surface p-4"
              >
                <h3 id={`${r.id}-h`} className="text-sm font-semibold text-text-primary">
                  {r.what}
                </h3>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
                  <dt className="hud-label pt-0.5">Captured</dt>
                  <dd className="text-text-secondary">{r.captured}</dd>
                  <dt className="hud-label pt-0.5">Leaves device</dt>
                  <dd className="text-text-secondary">{r.leaves}</dd>
                  <dt className="hud-label pt-0.5">Stored, how long</dt>
                  <dd className="text-text-secondary">{r.stored}</dd>
                  <dt className="hud-label pt-0.5">Delete it</dt>
                  <dd className="text-text-secondary">{r.remove}</dd>
                </dl>
              </section>
            ))}
          </div>

          <section id="delete" className="mt-12 scroll-mt-6 text-sm leading-relaxed text-text-secondary">
            <h2 className="font-display text-lg font-semibold text-text-primary">Delete everything</h2>
            <p className="mt-3">
              Settings → Delete account (type DELETE to confirm). It removes your chats, projects, memories, documents,
              tasks, notes, synced photos and every other record from our database, clears this browser&apos;s local
              copies, revokes the Google access you granted, and signs you out. It cannot be undone. Other browsers
              or devices keep their own local copies until you sign out there or clear site data.
            </p>
            <p className="mt-3">
              To ask for anything else, email{" "}
              <a href="mailto:anchit.tandon@gmail.com" className="text-accent-blue hover:underline">
                anchit.tandon@gmail.com
              </a>
              . The full legal text is in the{" "}
              <Link href="/privacy_policy" className="text-accent-blue hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
