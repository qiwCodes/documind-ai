import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  const conversations = await prisma.conversation.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { title?: string };

  const conversation = await prisma.conversation.create({
    data: {
      projectId,
      title: body.title?.trim() || "New chat",
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
