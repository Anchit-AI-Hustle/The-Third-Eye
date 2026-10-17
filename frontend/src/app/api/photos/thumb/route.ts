import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!email) return new Response(null, { status: 401 });
  const db = getDb();
  const id = new URL(req.url).searchParams.get("id");
  if (!db || !id) return new Response(null, { status: 404 });
  const { data } = await db.from("device_photos").select("thumb").eq("user_id", email).eq("id", id).maybeSingle();
  if (!data?.thumb) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data.thumb, "base64"), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" },
  });
}
