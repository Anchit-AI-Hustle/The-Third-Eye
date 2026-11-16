// In the Android app, SMS and calls go straight out over the phone's own
// network through the DeviceControl plugin (one-time permission), with no app
// opening, and WhatsApp opens with the message typed and, when WhatsApp
// auto-send is on (Accessibility), is sent. Elsewhere (browser, iPhone) this
// returns null and the caller opens Messages, the dialer or WhatsApp instead.

type Result = { ok: boolean; error?: string };
type Plugin = {
  sendSms: (o: { to: string; message: string }) => Promise<Result>;
  call: (o: { number: string }) => Promise<Result>;
  sendWhatsApp?: (o: { url: string }) => Promise<{ ok: boolean; sent: boolean }>;
};
type Link = { action?: string; url: string; nativeUrl?: string; message?: string; to?: string };

function plugin(): Plugin | null {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor;
  const p = cap?.getPlatform?.() === "android" ? (cap.Plugins?.DeviceControl as Plugin | undefined) : undefined;
  return p?.sendSms ? p : null;
}

function numberOf(link: Link): string | undefined {
  if (link.action !== "sms" && link.action !== "call") return undefined;
  return link.url.match(/^(?:sms|tel):([+\d][\d\s-]{5,})/)?.[1]?.replace(/[\s-]/g, "");
}

const whatsAppUrl = (link: Link) => link.action === "whatsapp" && /\d{7,15}/.test(link.url) ? (link.nativeUrl || link.url) : undefined;

export function deviceSendable(link: Link): boolean {
  const p = plugin();
  return Boolean(p && (numberOf(link) || (p.sendWhatsApp && whatsAppUrl(link))));
}

export async function sendFromDevice(link: Link): Promise<{ ok: boolean; text: string } | null> {
  const p = plugin();
  const wa = whatsAppUrl(link);
  if (p?.sendWhatsApp && wa) {
    const r = await p.sendWhatsApp({ url: wa }).catch(() => ({ ok: false, sent: false }));
    const who = link.to ? ` to ${link.to}` : "";
    if (!r.ok) return { ok: false, text: `WhatsApp didn't open${who}.` };
    return r.sent
      ? { ok: true, text: `Sent on WhatsApp${who} from your phone.` }
      : { ok: true, text: `WhatsApp is open${who} with the message typed; tap send. To have it sent for you, turn on The Third Eye under Settings → Accessibility (WhatsApp auto-send).` };
  }
  const number = numberOf(link);
  if (!p || !number) return null;
  if (link.action === "call") {
    const r = await p.call({ number }).catch((e: Error) => ({ ok: false, error: e.message }));
    return r.ok ? { ok: true, text: `Calling ${number} from your phone.` } : { ok: false, text: `The call to ${number} did not go through: ${r.error ?? "unknown error"}.` };
  }
  const r = await p.sendSms({ to: number, message: link.message ?? "" }).catch((e: Error) => ({ ok: false, error: e.message }));
  return r.ok ? { ok: true, text: `SMS sent from your phone to ${number}.` } : { ok: false, text: `The SMS to ${number} was not sent: ${r.error ?? "unknown error"}.` };
}
