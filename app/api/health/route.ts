import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "online",
    timestamp: new Date().toISOString(),
  });
}
