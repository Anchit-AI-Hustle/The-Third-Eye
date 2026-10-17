import { normPhone } from "@/lib/phone";

// A number for wa.me: digits with the country code. A local number takes the
// code of the user's own country, read from their time zone; India when the
// zone is unknown, as in the sign-in form.

const ZONE_CODES: [RegExp, string][] = [
  [/^Asia\/(Kolkata|Calcutta)$/, "+91"],
  [/^America\/(?!Sao_Paulo|Argentina|Mexico_City|Bogota|Lima|Santiago|Caracas)/, "+1"],
  [/^Europe\/London$/, "+44"],
  [/^Asia\/Dubai$/, "+971"],
  [/^Asia\/Singapore$/, "+65"],
  [/^Australia\//, "+61"],
  [/^Asia\/Karachi$/, "+92"],
  [/^Asia\/Dhaka$/, "+880"],
  [/^Asia\/Kathmandu$/, "+977"],
  [/^Asia\/Colombo$/, "+94"],
  [/^Europe\/Berlin$/, "+49"],
  [/^Asia\/Tokyo$/, "+81"],
];

export function callingCode(timeZone?: string): string | null {
  return ZONE_CODES.find(([re]) => timeZone && re.test(timeZone))?.[1] ?? null;
}

export function toWhatsAppNumber(raw: string, timeZone?: string): string {
  const trimmed = raw.trim().replace(/^00/, "+");
  if (!trimmed.replace(/\D/g, "")) return "";
  const parsed = normPhone(trimmed, callingCode(timeZone) ?? "+91");
  if (parsed) return parsed.e164.slice(1);
  // Not a shape the country rules know: a long number already carries its code.
  return trimmed.replace(/\D/g, "");
}
