import { getDb } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

export async function storeGithubToken(userId: string, token: string, login?: string | null): Promise<boolean> {
  if (!userId || !token) return false;
  const sb = getDb();
  if (!sb) return false;
  const enc = encrypt(token);
  if (!enc) return false;
  const { error } = await sb.from("github_tokens").upsert(
    { user_id: userId, access_token_enc: enc, login: login ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return !error;
}

export async function getGithubAccessToken(userId: string): Promise<{ token: string; login?: string | null } | null> {
  const sb = getDb();
  if (!sb) return null;
  const { data } = await sb.from("github_tokens").select("access_token_enc, login").eq("user_id", userId).maybeSingle();
  const enc = (data as { access_token_enc?: string; login?: string | null } | null)?.access_token_enc;
  if (!enc) return null;
  const token = decrypt(enc);
  if (!token) return null;
  return { token, login: (data as { login?: string | null }).login };
}

export async function revokeGithubAccess(userId: string): Promise<boolean> {
  const sb = getDb();
  if (!sb) return false;
  const { error } = await sb.from("github_tokens").delete().eq("user_id", userId);
  return !error;
}

async function gh(token: string, path: string): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "the-third-eye",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

function repoOf(input: { repo?: string; owner?: string }): string {
  const repo = String(input.repo ?? "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "");
  if (!repo || repo.includes("..") || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error("Give the repository as owner/name.");
  }
  return repo;
}

/** Read the signed-in user's GitHub account. Writes stay out of this tool. */
export async function runGithub(
  token: string,
  action: string,
  input: { repo?: string; path?: string; query?: string },
): Promise<string> {
  if (action === "status" || action === "whoami") {
    const me = await gh(token, "/user");
    return `Connected to GitHub as ${me.login}${me.name ? ` (${me.name})` : ""}. Public repos: ${me.public_repos ?? 0}.`;
  }
  if (action === "list_repos") {
    const repos = await gh(token, "/user/repos?per_page=20&sort=updated&affiliation=owner,collaborator,organization_member");
    if (!Array.isArray(repos) || !repos.length) return "No repositories on this account.";
    return repos
      .map((r: any) => `- ${r.full_name} [${r.private ? "private" : "public"}] ${r.description ?? ""}`.trim())
      .join("\n");
  }
  if (action === "list_issues") {
    const repo = repoOf(input);
    const issues = await gh(token, `/repos/${repo}/issues?state=open&per_page=20`);
    const rows = (Array.isArray(issues) ? issues : []).filter((i: any) => !i.pull_request);
    if (!rows.length) return `No open issues in ${repo}.`;
    return rows.map((i: any) => `- #${i.number} ${i.title}`).join("\n");
  }
  if (action === "list_pulls") {
    const repo = repoOf(input);
    const pulls = await gh(token, `/repos/${repo}/pulls?state=open&per_page=15`);
    if (!Array.isArray(pulls) || !pulls.length) return `No open pull requests in ${repo}.`;
    return pulls.map((p: any) => `- #${p.number} ${p.title} (${p.user?.login ?? "?"})`).join("\n");
  }
  if (action === "get_file") {
    const repo = repoOf(input);
    const path = String(input.path ?? "").replace(/^\/+/, "");
    if (!path || path.includes("..")) throw new Error("Give a file path inside the repository.");
    const file = await gh(token, `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`);
    if (Array.isArray(file)) return file.map((f: any) => `${f.type === "dir" ? "dir" : "file"} ${f.path}`).join("\n");
    if (file.encoding === "base64" && typeof file.content === "string") {
      const text = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
      return `${file.path} (${file.size} bytes)\n\n${text.slice(0, 12000)}`;
    }
    return `${file.path}: ${file.html_url ?? "no preview"}`;
  }
  if (action === "search_code") {
    const q = String(input.query ?? "").trim();
    if (!q) throw new Error("Give a search query.");
    const me = await gh(token, "/user");
    const scoped = /\buser:|\borg:|\brepo:/.test(q) ? q : `${q} user:${me.login}`;
    const found = await gh(token, `/search/code?q=${encodeURIComponent(scoped)}&per_page=10`);
    const items = found?.items ?? [];
    if (!items.length) return `No code matched "${q}".`;
    return items.map((i: any) => `- ${i.repository?.full_name ?? "?"}:${i.path}`).join("\n");
  }
  throw new Error(`Unknown GitHub action "${action}". Use status, list_repos, list_issues, list_pulls, get_file, or search_code.`);
}
