import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { fileName?: string };
  const fileName = body.fileName?.trim();

  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: { fileName },
    select: { id: true, fileName: true },
  });

  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  await prisma.document.delete({
    where: { id: documentId },
  });
  return new NextResponse(null, { status: 204 });
}
