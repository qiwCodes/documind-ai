import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  const documents = await prisma.document.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          chunks: true,
        },
      },
    },
  });

  return NextResponse.json({ documents });
}
