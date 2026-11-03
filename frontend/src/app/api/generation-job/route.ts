import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assistantMediaStatus } from "@/lib/assistantMedia";
import { refundJobOnce } from "@/lib/credits";

const ACTION: Record<string, string> = {
  image: "image.generate",
  music: "music.generate",
  video: "video.render",
};

export async function GET(req: Request) {
  const user = (await getServerSession(authOptions))?.user?.email;
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const result = await assistantMediaStatus(user, new URL(req.url).searchParams.get("ticket") ?? "");
    const failed =
      result.status === "failed" ||
      result.status === "canceled" ||
      (result.status === "succeeded" && !result.url);
    let refunded = false;
    if (failed && result.id && ACTION[result.kind]) {
      refunded = await refundJobOnce(user, ACTION[result.kind], result.id);
    }
    return Response.json(
      { ...result, ...(failed && !result.url ? { status: result.status === "succeeded" ? "failed" : result.status } : {}), refunded },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch { return Response.json({ error: "Could not load this job. The link may have expired or belong to another account." }, { status: 400 }); }
}
