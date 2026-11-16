// Laptop -> phone handoff for outreach (WhatsApp, SMS, calls): those leave from
// the phone, so a request made on a computer is queued for the user's phone.

export const isPhone = (ua = navigator.userAgent) => /Android|iPhone|iPod/i.test(ua);

export interface Outreach { action?: string; url: string; nativeUrl?: string; to?: string; message?: string }

const VERB: Record<string, string> = { whatsapp: "WhatsApp", sms: "Text", call: "Call" };

// True when the phone took it; false means open it here as before.
export async function handOffToPhone(l: Outreach): Promise<boolean> {
  if (isPhone() || !l.action || !VERB[l.action]) return false;
  try {
    const res = await fetch("/api/handoff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: l.action, url: l.url, nativeUrl: l.nativeUrl,
        label: `${VERB[l.action]}${l.to ? ` ${l.to}` : ""}`,
        detail: l.message ? `"${l.message.slice(0, 200)}"` : "",
      }),
    });
    return res.ok && (await res.json()).queued === true;
  } catch { return false; }
}

// Hands every outreach open_url in a reply to the phone (on a computer) and
// returns the side effects still to run here, plus a line saying what went.
export async function routeToPhone<T extends { type: string; data?: any }>(effects: T[] | undefined): Promise<{ effects: T[]; note: string }> {
  const all = effects ?? [];
  if (isPhone()) return { effects: all, note: "" };
  const handed = await Promise.all(all.map((fx) =>
    fx.type === "open_url" && fx.data?.url && !fx.data.missingPhone && VERB[fx.data.action]
      ? handOffToPhone({ action: fx.data.action, url: String(fx.data.url), nativeUrl: fx.data.nativeUrl, to: fx.data.to, message: fx.data.message })
      : Promise.resolve(false)));
  const sent = all.filter((_, i) => handed[i]);
  return {
    effects: all.filter((_, i) => !handed[i]),
    note: sent.length ? `Sent to your phone: ${sent.map((fx) => fx.data.label || VERB[fx.data.action]).join(", ")}. Tap the notification or open the app there; it opens ready to go.` : "",
  };
}
