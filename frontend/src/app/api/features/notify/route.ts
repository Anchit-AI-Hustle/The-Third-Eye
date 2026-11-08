import { notifyOwner } from "@/lib/featureRequests";

export const runtime = "nodejs";

// Called by the feature build workflow when a pull request is ready, so the
// owner gets it on WhatsApp to review.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { title?: string; url?: string } | null;
  if (!b?.url || !/^https:\/\/github\.com\/Anchit-AI-Hustle\/The-Third-Eye\/pull\/\d+$/i.test(b.url)) return Response.json({ error: "pull request url required" }, { status: 400 });
  const sent = await notifyOwner(`Built and ready for your review: "${String(b.title ?? "new feature").slice(0, 120)}".`, b.url);
  return Response.json({ sent });
}
