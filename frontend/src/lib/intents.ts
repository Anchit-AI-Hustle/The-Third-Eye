// Intent → deep-link layer. The assistant proposes an action ("pay ₹500 to
// Ravi", "WhatsApp mom I'm on my way", "call the office"); we resolve it into a
// standard app deep link / web intent. The app then opens PRE-FILLED and the
// user completes it in the target app — crucially for payments, THE PAYMENT
// APP handles the money and asks for approval/PIN; we never touch funds.
//
// Sensitive intents (pay/message/call/sms) go through the confirm-then-act card
// first (see lib/actions.ts + AssistantClient); low-risk ones (navigate, add to
// calendar) open directly. The confirm tap is the user gesture that opens the
// app, so it's reliable on iOS.

export interface ResolvedIntent {
  url: string;
  label: string;      // human summary for the confirm card / toast
  openLabel: string;  // button label, e.g. "Approve & pay"
}

const digits = (s: unknown) => String(s ?? "").replace(/[^\d+]/g, "");
const enc = encodeURIComponent;
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Tools that resolve to a client-side deep link (opened in the browser/app),
// as opposed to server-executed actions like send_email.
export const CLIENT_INTENT_TOOLS = new Set(["pay", "send_whatsapp", "make_call", "send_sms", "navigate_maps", "add_calendar_event"]);

export function resolveIntent(tool: string, a: any): ResolvedIntent | null {
  switch (tool) {
    case "pay": {
      // UPI deep link — opens the user's UPI app (GPay/PhonePe/Paytm) pre-filled.
      const pa = String(a?.vpa ?? a?.upi ?? "").trim();
      const amount = num(a?.amount);
      if (!pa || !amount) return null; // need payee + amount; model should ask
      const pn = String(a?.name ?? a?.payee ?? "").trim();
      const cur = String(a?.currency ?? "INR").toUpperCase().slice(0, 3);
      const note = String(a?.note ?? "").trim();
      const q = new URLSearchParams({ pa, am: amount.toFixed(2), cu: cur });
      if (pn) q.set("pn", pn);
      if (note) q.set("tn", note);
      return {
        url: `upi://pay?${q.toString()}`,
        label: `Pay ${cur === "INR" ? "₹" : cur + " "}${amount} to ${pn || pa}${note ? ` — “${note}”` : ""}`,
        openLabel: "Approve & pay",
      };
    }
    case "send_whatsapp": {
      const to = digits(a?.to ?? a?.number);
      const text = String(a?.message ?? a?.text ?? "").trim();
      if (!text) return null;
      const base = to ? `https://wa.me/${to}` : "https://wa.me/";
      return {
        url: `${base}?text=${enc(text)}`,
        label: `WhatsApp ${to || "(pick a chat)"}: “${text}”`,
        openLabel: "Open WhatsApp",
      };
    }
    case "make_call": {
      const to = digits(a?.number ?? a?.to);
      if (!to) return null;
      return { url: `tel:${to}`, label: `Call ${to}`, openLabel: "Call" };
    }
    case "send_sms": {
      const to = digits(a?.number ?? a?.to);
      const body = String(a?.message ?? a?.text ?? "").trim();
      if (!to) return null;
      return { url: `sms:${to}${body ? `?&body=${enc(body)}` : ""}`, label: `Text ${to}${body ? `: “${body}”` : ""}`, openLabel: "Open Messages" };
    }
    case "navigate_maps": {
      const dest = String(a?.destination ?? a?.to ?? a?.place ?? "").trim();
      if (!dest) return null;
      return { url: `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}`, label: `Directions to ${dest}`, openLabel: "Open Maps" };
    }
    case "add_calendar_event": {
      const title = String(a?.title ?? a?.text ?? "").trim();
      if (!title) return null;
      const q = new URLSearchParams({ action: "TEMPLATE", text: title });
      // dates: expect compact UTC "YYYYMMDDTHHMMSSZ/…"; pass through if provided.
      if (a?.start && a?.end) q.set("dates", `${a.start}/${a.end}`);
      if (a?.details) q.set("details", String(a.details));
      if (a?.location) q.set("location", String(a.location));
      return { url: `https://calendar.google.com/calendar/render?${q.toString()}`, label: `Add event: ${title}`, openLabel: "Add to Calendar" };
    }
    default:
      return null;
  }
}
