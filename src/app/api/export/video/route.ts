import type { NextRequest } from "next/server";
import { renderQuestionVideo } from "@/lib/export/video";
import { FfmpegUnavailableError } from "@/lib/export/ffmpeg";
import { errorMessage } from "@/lib/errorMessage";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      question: NormalizedQuestion;
      templateId: TemplateId;
      ctaText?: string;
      questionSeconds: number;
      countdownSeconds: number;
      answerSeconds: number;
    };

    const buffer = await renderQuestionVideo(
      body.question,
      body.templateId,
      body.ctaText ?? "",
      { questionSeconds: body.questionSeconds, countdownSeconds: body.countdownSeconds, answerSeconds: body.answerSeconds },
      request.nextUrl.origin
    );

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="Q${body.question.index}-short.mp4"`,
      },
    });
  } catch (err) {
    console.error("Video export failed:", err);
    // A missing ffmpeg is a server configuration problem the admin can act on,
    // not a bug in the request, so it gets a 422 with instructions instead of an
    // opaque 500 that reads like the app is broken.
    if (err instanceof FfmpegUnavailableError) {
      return Response.json({ error: errorMessage(err), code: "ffmpeg_unavailable" }, { status: 422 });
    }
    return Response.json({ error: errorMessage(err, "Video export failed") }, { status: 500 });
  }
}
