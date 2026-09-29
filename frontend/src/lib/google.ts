// Server-side Google helpers for the cron dispatcher: exchange a stored refresh
// token for an access token, then send Gmail on the user's behalf.

export async function accessTokenFromRefresh(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * The address of the mailbox this token belongs to.
 *
 * Needed because the app's identity key is not always an email: under phone
 * sign-in it is an E.164 number, and the cron used it directly as the `To:` for
 * reminders and the daily digest, which produced messages addressed to
 * `+919876543210`. The recipient in those cases is the user's own mailbox, and we
 * are already holding a token for it, so the mailbox can say what it is called.
 */
export async function gmailAddressFor(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { emailAddress?: string };
    return json.emailAddress ?? null;
  } catch {
    return null;
  }
}

export async function sendGmail(
  accessToken: string,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");
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
