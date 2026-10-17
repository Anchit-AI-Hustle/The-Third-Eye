import { webClipProfile } from "@/lib/webClip";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const icon = await fetch(new URL("/icon-512.png", origin)).then((r) => r.arrayBuffer());
  return new Response(webClipProfile(origin, Buffer.from(icon).toString("base64")), {
    headers: {
      "Content-Type": "application/x-apple-aspen-config",
      "Content-Disposition": 'attachment; filename="jarvis.mobileconfig"',
    },
  });
}
