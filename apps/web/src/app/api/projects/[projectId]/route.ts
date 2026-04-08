import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
  };

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      title,
      description: body.description?.trim() || null,
    },
    select: {
      id: true,
      title: true,
      description: true,
    },
  });

  return NextResponse.json({ project });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  await prisma.project.delete({
    where: { id: projectId },
  });

  return new NextResponse(null, { status: 204 });
}
