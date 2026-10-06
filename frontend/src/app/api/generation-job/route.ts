import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assistantMediaStatus } from "@/lib/assistantMedia";

export async function GET(req: Request) {
  const user = (await getServerSession(authOptions))?.user?.email;
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const result = await assistantMediaStatus(user, new URL(req.url).searchParams.get("ticket") ?? "");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not load this job. The link may have expired or belong to another account." }, { status: 400 }); }
}
