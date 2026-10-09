import { getPrintImage } from "@/lib/export/imageStore";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getPrintImage(id);
  if (!entry) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(entry.buffer), { headers: { "Content-Type": entry.contentType, "Cache-Control": "no-store" } });
}
