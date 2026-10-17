import { gh } from "@/lib/github";
import { llmCascade } from "@/lib/llmCascade";

// The app builder: JARVIS writes a static web app (HTML, CSS, JS), creates a
// public repo on the user's GitHub and serves it free on GitHub Pages.
// Creating a public repo is publishing, so it only runs after the user
// confirms (lib/actions.ts).

export interface AppFile { path: string; content: string }

const MAX_FILES = 20;
const MAX_BYTES = 500_000;
const SAFE_PATH = /^(?!\.)(?:[\w-]+\/)*[\w.-]+\.(html|css|js|mjs|json|svg|txt|md|webmanifest)$/i;

export function parseAppFiles(text: string): AppFile[] | string {
  const files: AppFile[] = [];
  for (const m of text.matchAll(/^=== FILE: (.+?) ===\r?\n([\s\S]*?)\r?\n=== END ===/gm)) {
    const path = m[1].trim();
    if (!SAFE_PATH.test(path) || path.includes("..")) return `Refused file path "${path}".`;
    files.push({ path, content: m[2] });
  }
  if (!files.some((f) => f.path === "index.html")) return "The app has no index.html, so there is nothing for Pages to serve.";
  if (files.length > MAX_FILES) return `The app has ${files.length} files; the limit is ${MAX_FILES} files.`;
  if (files.reduce((n, f) => n + Buffer.byteLength(f.content), 0) > MAX_BYTES) return "The app is too large to publish (over 500 KB).";
  return files;
}

export function repoSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "jarvis-app";
}

const SYSTEM = `You build complete, working static web apps that run in the browser with no server and no build step.
Write every file in full, in this exact format and nothing else:
=== FILE: index.html ===
<file contents>
=== END ===
Rules: index.html is required. Use plain HTML, CSS and JavaScript (ES modules are fine); libraries only from https://cdn.jsdelivr.net with an exact version. Keep data in localStorage. No API keys, no backend, no placeholders or TODOs: every button must work. Make it responsive and accessible.`;

export async function generateApp(description: string): Promise<AppFile[] | string> {
  const out = await llmCascade({ system: SYSTEM, messages: [{ role: "user", content: description }], maxTokens: 8000, temperature: 0.4, timeoutMs: 45_000, stage: "app-builder" });
  return parseAppFiles(out.text);
}

export interface Published { repoUrl: string; pagesUrl: string; pages: boolean; pagesError?: string }

export async function publishApp(token: string, name: string, description: string, files: AppFile[]): Promise<Published> {
  const base = repoSlug(name);
  let repo: any;
  for (let i = 1; !repo; i++) {
    const tryName = i === 1 ? base : `${base}-${i}`;
    try {
      repo = await gh(token, "/user/repos", { method: "POST", body: { name: tryName, description: description.slice(0, 300), private: false, auto_init: true } });
    } catch (e) {
      if (i >= 5 || !String(e).includes("GitHub 422")) throw e;
    }
  }
  const owner = repo.owner.login;
  const branch = repo.default_branch ?? "main";
  // Sequential: parallel writes to one branch race on its head commit.
  for (const f of files) {
    const path = f.path.split("/").map(encodeURIComponent).join("/");
    await gh(token, `/repos/${owner}/${repo.name}/contents/${path}`, {
      method: "PUT", body: { message: `Add ${f.path}`, content: Buffer.from(f.content).toString("base64"), branch },
    });
  }
  const pagesUrl = `https://${owner.toLowerCase()}.github.io/${repo.name}/`;
  try {
    await gh(token, `/repos/${owner}/${repo.name}/pages`, { method: "POST", body: { source: { branch, path: "/" } } });
    return { repoUrl: repo.html_url, pagesUrl, pages: true };
  } catch (e) {
    return { repoUrl: repo.html_url, pagesUrl, pages: false, pagesError: e instanceof Error ? e.message : String(e) };
  }
}
