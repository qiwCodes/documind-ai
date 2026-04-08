import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DocumentUploader } from "@/components/dashboard/DocumentUploader";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/client";
import { isDatabaseConfigured } from "@/lib/db/runtime";
import { safeDbQuery } from "@/lib/db/safe-query";

export default async function LibraryPage() {
  const { email } = await requireUser("/dashboard/library");
  const dbReady = isDatabaseConfigured();
  const projects = dbReady
    ? await safeDbQuery(
        () =>
          prisma.project.findMany({
            orderBy: { updatedAt: "desc" },
          }),
        [],
      )
    : [];
  const documents = dbReady
    ? await safeDbQuery(
        () =>
          prisma.document.findMany({
            orderBy: { updatedAt: "desc" },
            include: {
              project: {
                select: {
                  title: true,
                },
              },
              _count: {
                select: {
                  chunks: true,
                },
              },
            },
            take: 50,
          }),
        [],
      )
    : [];

  return (
    <DashboardLayout userEmail={email}>
      <section className="space-y-6">
        {!dbReady ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Set <code>DATABASE_URL</code> to enable Library data and uploads.
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-2 text-sm text-slate-600">
            Upload and monitor documents across all projects.
          </p>
        </div>

        {dbReady ? (
          <DocumentUploader
            projects={projects.map((project) => ({
              id: project.id,
              title: project.title,
            }))}
          />
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold">Recent documents</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-4">File</th>
                  <th className="py-2 pr-4">Project</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Chunks</th>
                  <th className="py-2 pr-4">Updated</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} className="border-t border-slate-200">
                    <td className="py-2 pr-4">{document.fileName}</td>
                    <td className="py-2 pr-4">{document.project.title}</td>
                    <td className="py-2 pr-4">{document.status}</td>
                    <td className="py-2 pr-4">{document._count.chunks}</td>
                    <td className="py-2 pr-4">
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(document.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {documents.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">No documents uploaded yet.</p>
            ) : null}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}
