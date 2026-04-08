import { NextResponse } from "next/server";
import { MessageRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";

function parseRole(role: string | undefined): MessageRole {
  if (role === "assistant") return MessageRole.ASSISTANT;
  if (role === "system") return MessageRole.SYSTEM;
  return MessageRole.USER;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    messages: messages.map((message) => ({
      ...message,
      role: message.role.toLowerCase(),
    })),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { role?: string; content?: string };

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      role: parseRole(body.role),
      content,
    },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      message: {
        ...message,
        role: message.role.toLowerCase(),
      },
    },
    { status: 201 },
  );
}
