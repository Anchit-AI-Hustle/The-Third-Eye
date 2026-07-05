import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { isSensitive } from "@/lib/actions";
import { premiumEnforced, PREMIUM_TOOLS } from "@/lib/entitlements";
import { getTier } from "@/lib/usage";

export const runtime = "nodejs";

// Executes a single user-confirmed action, exactly as it was shown for approval.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return json({ error: "Not authenticated" }, 401);
  const accessToken = (session as any).accessToken as string | undefined;

  const { tool, args } = (await req.json().catch(() => ({}))) as { tool?: string; args?: any };
  if (!tool || !isSensitive(tool)) return json({ error: "Unknown or non-confirmable action" }, 400);

  // Mirror the chat route's premium gate so the paywall can't be bypassed via the
  // confirmation endpoint when enforcement is on.
  if (premiumEnforced() && PREMIUM_TOOLS.has(tool) && (await getTier(email)) !== "premium") {
    return json({ ok: false, result: "That action needs JARVIS Premium. Upgrade in Settings → Upgrade." });
  }

  switch (tool) {
    case "send_email": {
      if (!accessToken) return json({ ok: false, result: "Gmail not connected — sign out and back in to grant access." });
      const ok = await sendGmail(accessToken, args?.to, args?.subject ?? "", args?.body ?? "");
      return json({ ok, result: ok ? `Email sent to ${args?.to}.` : "Gmail rejected the send." });
    }
    default:
      return json({ error: "Unsupported action" }, 400);
  }
}

async function sendGmail(accessToken: string, to: string, subject: string, body: string): Promise<boolean> {
  const raw = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encoded }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
