import { NextResponse } from "next/server";
import { generateRagAnswer } from "@/features/chat/rag-chat-service";

const CITATION_MARKER = "__CITATIONS__";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    projectId?: string;
    message?: string;
    action?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };
  const projectId = body.projectId?.trim();
  const message = body.message?.trim();

  if (!projectId || !message) {
    return NextResponse.json({ error: "projectId and message are required" }, { status: 400 });
  }

  const rag = await generateRagAnswer({
    projectId,
    message,
    action: body.action,
    history: body.history ?? [],
  });

  const encoder = new TextEncoder();
  const tokens = rag.answer.split(/(\s+)/).filter(Boolean);
  const trailer = `\n\n${CITATION_MARKER}${JSON.stringify(rag.citations)}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const token of tokens) {
        controller.enqueue(encoder.encode(token));
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      controller.enqueue(encoder.encode(trailer));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
