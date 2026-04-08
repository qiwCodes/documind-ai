import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Prisma } from "@prisma/client";
import { ProjectListManager } from "@/components/dashboard/ProjectListManager";
import { ProjectCreateForm } from "@/components/dashboard/ProjectCreateForm";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/client";
import { isDatabaseConfigured } from "@/lib/db/runtime";
import { safeDbQuery } from "@/lib/db/safe-query";

export default async function WorkspacePage() {
  const { email } = await requireUser("/dashboard/workspace");
  const dbReady = isDatabaseConfigured();
  let schemaMissing = false;
  const projects = dbReady
    ? await safeDbQuery(
        () =>
          prisma.project.findMany({
            orderBy: { updatedAt: "desc" },
            include: {
              _count: {
                select: {
                  documents: true,
                },
              },
            },
          }),
        [],
      )
    : [];

  if (dbReady) {
    try {
      await prisma.project.count();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
      ) {
        schemaMissing = true;
      } else {
        throw error;
      }
    }
  }

  return (
    <DashboardLayout userEmail={email}>
      <section className="space-y-6">
        {!dbReady ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Set <code>DATABASE_URL</code> in your env file to enable project, upload, and chat features.
          </div>
        ) : schemaMissing ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Database is connected but tables may be missing. Run <code>npx prisma db push --schema apps/web/prisma/schema.prisma</code>.
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
          <p className="mt-2 text-sm text-slate-600">
            Welcome back {email}. Choose a project or create a new one to open the full project workspace.
          </p>
        </div>

        {dbReady ? (
          <div className="max-w-xl">
            <ProjectCreateForm />
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold">Projects</h2>
          <ProjectListManager initialProjects={projects} />
        </div>
      </section>
    </DashboardLayout>
  );
}
