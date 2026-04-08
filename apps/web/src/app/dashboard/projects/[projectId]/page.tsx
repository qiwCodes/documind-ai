import { notFound } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProjectWorkspaceShell } from "@/components/dashboard/ProjectWorkspaceShell";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/client";
import { safeDbQuery } from "@/lib/db/safe-query";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { email } = await requireUser("/dashboard/workspace");
  const { projectId } = await params;

  const project = await safeDbQuery(
    () =>
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, title: true },
      }),
    null,
  );

  if (!project) {
    notFound();
  }

  return (
    <DashboardLayout userEmail={email}>
      <ProjectWorkspaceShell projectId={project.id} projectTitle={project.title} />
    </DashboardLayout>
  );
}
