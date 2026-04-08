import { prisma } from "@/lib/db/client";
import { buildProjectVectorNamespace } from "@/lib/vector/namespace";

type CreateProjectInput = {
  title: string;
  description?: string;
};

export async function listProjects() {
  return prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          documents: true,
          conversations: true,
        },
      },
    },
  });
}

export async function createProject(input: CreateProjectInput) {
  const project = await prisma.project.create({
    data: {
      title: input.title,
      description: input.description,
      vectorNamespace: "pending",
    },
  });

  const vectorNamespace = buildProjectVectorNamespace(project.id);

  return prisma.project.update({
    where: { id: project.id },
    data: { vectorNamespace },
  });
}
