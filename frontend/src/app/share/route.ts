import { sharedMessage } from "@/lib/share";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const message = sharedMessage({ title: q.get("title"), text: q.get("text"), url: q.get("url") });
  const to = new URL("/assistant", req.url);
  if (message) to.searchParams.set("ask", message);
  return Response.redirect(to.toString(), 303);
}
