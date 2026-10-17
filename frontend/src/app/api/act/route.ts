import type { NextRequest } from "next/server";
import { identify } from "@/lib/serverIdentity";
import { isSensitive } from "@/lib/actions";
import { premiumEnforced, PREMIUM_TOOLS } from "@/lib/entitlements";
import { getTier } from "@/lib/usage";
import { getGoogleAccessToken } from "@/lib/googleToken";
import { emailRecipients, gmailComposeUrl, gmailSendError } from "@/lib/liveActions";
import { callMcpTool, isMcpTool } from "@/lib/mcp/client";
import { runAnchor, anchorRequestFrom } from "@/lib/anchor";
import { generateApp, publishApp } from "@/lib/appBuilder";
import { getGithubAccessToken } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 120;

// Executes a single user-confirmed action, exactly as it was shown for approval.
export async function POST(req: NextRequest) {
  // A browser session, or the scoped token WhatsApp acts with when the user replies YES.
  const { email } = await identify(req.headers, "chat");
  if (!email) return json({ error: "Not authenticated" }, 401);
  // The confirmed send needs a token carrying gmail.send. Google sign-in asks
  // for it, and Settings → Connections can grant it again if it was declined.
  // The session token is not used here, because it can lag a re-consent.
  let accessToken: string | undefined;
  try {
    const connected = await getGoogleAccessToken(email);
    if (connected?.accessToken) accessToken = connected.accessToken;
  } catch { /* not connected - reported below */ }

  const { tool, args } = (await req.json().catch(() => ({}))) as { tool?: string; args?: any };
  if (!tool || !isSensitive(tool, args)) return json({ error: "Unknown or non-confirmable action" }, 400);

  // Mirror the chat route's premium gate so the paywall can't be bypassed via the
  // confirmation endpoint when enforcement is on.
  if (premiumEnforced() && PREMIUM_TOOLS.has(tool) && (await getTier(email)) !== "premium") {
    return json({ ok: false, result: "That action needs JARVIS Premium. Upgrade in Settings → Upgrade." });
  }

  switch (tool) {
    // `communicate` with action='email' is what the model actually calls;
    // `send_email` is the older intent label. Both land here.
    case "communicate":
    case "send_email": {
      // Sending mail was premium-gated inside runTool's `communicate` case. Now
      // that the email action is confirmed first, it never reaches runTool — so
      // that check has to live here or the paywall is bypassed whenever
      // ENFORCE_PREMIUM is on. Gating on the action rather than adding
      // `communicate` to PREMIUM_TOOLS keeps whatsapp/sms/call/read_emails free,
      // which is what they were.
      if (premiumEnforced() && (await getTier(email)) !== "premium") {
        return json({ ok: false, result: "Sending email needs JARVIS Premium. Upgrade in Settings → Upgrade." });
      }
      const recipients = emailRecipients(String(args?.to ?? ""));
      const to = recipients.join(", ");
      const subject = String(args?.subject ?? "");
      const body = String(args?.body ?? "");
      if (!recipients.length) {
        return json({ ok: false, result: "Need a valid email address to send." });
      }
      const compose = gmailComposeUrl(to, subject, body);
      if (!accessToken) {
        return json({
          ok: false,
          openUrl: compose,
          result: `Gmail isn't connected for a direct send. No email was sent. Open the Gmail draft below to send to ${to} yourself. To send from here next time: Settings → Connections → "Connect Google".`,
        });
      }
      const sent = await sendGmail(accessToken, to, subject, body);
      if (sent.ok) return json({ ok: true, result: `Email sent to ${to}.` });
      console.error("gmail send failed", sent.status, sent.error.slice(0, 400));
      return json({ ok: false, openUrl: compose, result: `${gmailSendError(sent.status, sent.error)} You can open the Gmail draft below.` });
    }
    case "build_app": {
      const gh = await getGithubAccessToken(email);
      if (!gh?.token) return json({ ok: false, openUrl: "/api/connect/github", result: "GitHub isn't connected, so no app was built. Connect GitHub and ask again." });
      const name = String(args?.name ?? "app");
      const description = String(args?.description ?? "");
      const files = await generateApp(`${name}: ${description}`).catch((e) => `the AI providers failed (${e instanceof Error ? e.message : e})`);
      if (typeof files === "string") return json({ ok: false, result: `The app wasn't built: ${files} Nothing was created on GitHub.` });
      const out = await publishApp(gh.token, name, description, files).catch((e) => (e instanceof Error ? e.message : String(e)));
      if (typeof out === "string") return json({ ok: false, result: `Publishing to GitHub failed: ${out}` });
      return json({
        ok: true,
        openUrl: out.pages ? out.pagesUrl : out.repoUrl,
        result: out.pages
          ? `Built ${files.length} files and published them to ${out.repoUrl}. GitHub Pages is building it; it goes live at ${out.pagesUrl} in a minute or two.`
          : `Built ${files.length} files and pushed them to ${out.repoUrl}, but GitHub Pages could not be turned on (${out.pagesError}). Turn it on in the repo's Settings > Pages.`,
      });
    }
    case "anchor": {
      const out = await runAnchor(email, anchorRequestFrom(args));
      return json({ ok: out.ok, result: out.message });
    }
    default:
      // Confirmed connector (MCP) write. `isSensitive` above already classified
      // it as one, so reaching here means the user approved this exact payload
      // — run it against the configured server. Without this branch every
      // connector write would be proposed and then dead-end as "unsupported".
      if (isMcpTool(tool)) {
        const result = await callMcpTool(tool, args ?? {}, email);
        // callMcpTool reports transport and tool errors as text rather than
        // throwing, so the wording is the server's own. Surface it as-is rather
        // than claiming a success we cannot verify.
        return json({ ok: true, result });
      }
      return json({ error: "Unsupported action" }, 400);
  }
}

async function sendGmail(accessToken: string, to: string, subject: string, body: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const header = (s: string) => s.replace(/[\r\n]/g, " ").trim();
  const raw = [`To: ${header(to)}`, `Subject: ${header(subject)}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encoded }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, status: res.status, error: await res.text().catch(() => "") };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
