import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { systemStatus } from "@/lib/providerReady";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user?.email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json(systemStatus());
}
