import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { isSensitive } from "@/lib/actions";
import { premiumEnforced, PREMIUM_TOOLS } from "@/lib/entitlements";
import { getTier } from "@/lib/usage";
import { getGoogleAccessToken } from "@/lib/googleToken";
import { callMcpTool, isMcpTool } from "@/lib/mcp/client";

export const runtime = "nodejs";

// Executes a single user-confirmed action, exactly as it was shown for approval.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);
  // The confirmed send needs a token carrying gmail.send. Sign-in now requests
  // that scope, so the stored grant normally has it; the session token is still
  // not used here because it can lag a re-consent.
  let accessToken: string | undefined;
  try {
    const connected = await getGoogleAccessToken(email);
    if (connected?.accessToken) accessToken = connected.accessToken;
  } catch { /* not connected — reported below */ }

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
      if (!accessToken) return json({ ok: false, result: "Gmail isn't connected. Signing in with Google normally grants this — sign out and back in, or use Settings → Connections → \"Connect Google\" and allow Gmail access." });
      const sent = await sendGmail(accessToken, args?.to, args?.subject ?? "", args?.body ?? "");
      if (sent.ok) return json({ ok: true, result: `Email sent to ${args?.to}.` });
      if (sent.status === 401 || sent.status === 403)
        return json({ ok: false, result: "Email sending failed — Gmail send permission isn't granted. Reconnect from Settings → Connections (grant Gmail send access)." });
      return json({ ok: false, result: "Gmail rejected the send." });
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

async function sendGmail(accessToken: string, to: string, subject: string, body: string): Promise<{ ok: boolean; status?: number }> {
  const raw = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encoded }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
