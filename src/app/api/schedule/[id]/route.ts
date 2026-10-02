import type { NextRequest } from "next/server";
import { cancelScheduledPost, retryScheduledPost, updateScheduledPost } from "@/lib/supabase/schedule";
import { errorMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      action: "reschedule" | "cancel" | "retry" | "replaceQuestion";
      dateStr?: string;
      timeStr?: string;
      timezone?: string;
      /** For replaceQuestion: the question to put in this slot instead. */
      contentId?: string;
    };

    if (body.action === "cancel") {
      await cancelScheduledPost(id);
      return Response.json({ ok: true });
    }

    if (body.action === "retry") {
      await retryScheduledPost(id);
      return Response.json({ ok: true });
    }

    if (body.action === "reschedule") {
      if (!body.dateStr || !body.timeStr || !body.timezone) {
        return Response.json({ error: "dateStr, timeStr, and timezone are required to reschedule" }, { status: 400 });
      }
      const result = await updateScheduledPost(id, { dateStr: body.dateStr, timeStr: body.timeStr, timezone: body.timezone });
      // 409 rather than 500: the target slot is occupied, and the admin can act
      // on that by picking a different slot.
      if (result.conflict) {
        return Response.json({ conflict: true, existing: result.existing, error: "That slot is already taken" }, { status: 409 });
      }
      return Response.json({ post: result.post });
    }

    if (body.action === "replaceQuestion") {
      if (!body.contentId) return Response.json({ error: "contentId is required to replace the question" }, { status: 400 });
      const { replaceQuestionInSlot } = await import("@/lib/supabase/replace");
      const result = await replaceQuestionInSlot(id, body.contentId);
      if (result.error) return Response.json({ error: result.error }, { status: 400 });
      return Response.json({ post: result.post });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/schedule/[id] failed:", err);
    return Response.json({ error: errorMessage(err, "Failed to update schedule") }, { status: 500 });
  }
}
