import { NextResponse } from "next/server";
import { getPrintPayload } from "@/lib/export/tokenStore";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = getPrintPayload(token);

  if (!result.ok) {
    // All three failures are a 404 from the caller's point of view — the token
    // simply isn't usable — but they are logged distinctly because a
    // bad-signature in production means PRINT_TOKEN_SECRET is missing or
    // mismatched across instances, which is a deployment fault worth seeing.
    if (result.reason === "bad-signature") {
      console.error("print-data: token signature rejected. If PRINT_TOKEN_SECRET is set, every instance must share the same value.");
    }
    return NextResponse.json({ error: "Unknown or expired print token" }, { status: 404 });
  }

  return NextResponse.json(result.payload);
}
