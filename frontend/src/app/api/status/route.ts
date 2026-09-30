import { NextResponse } from "next/server";
import { systemStatus } from "@/lib/providerReady";

export async function GET() {
  return NextResponse.json(systemStatus());
}
