import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/client";
import { isDatabaseConfigured } from "@/lib/db/runtime";
import { safeDbQuery } from "@/lib/db/safe-query";

export default async function InsightsPage() {
  const { email } = await requireUser("/dashboard/insights");
  const dbReady = isDatabaseConfigured();
  const [projectCount, documentCount, chunkCount, readyCount, failedCount, topProjects] = dbReady
    ? await safeDbQuery(
        () =>
          Promise.all([
            prisma.project.count(),
            prisma.document.count(),
            prisma.documentChunk.count(),
            prisma.document.count({ where: { status: "READY" } }),
            prisma.document.count({ where: { status: "FAILED" } }),
            prisma.project.findMany({
              orderBy: { updatedAt: "desc" },
              include: {
                _count: {
                  select: {
                    documents: true,
                    conversations: true,
                  },
                },
              },
              take: 5,
            }),
          ]),
        [0, 0, 0, 0, 0, []],
      )
    : [0, 0, 0, 0, 0, []];

  return (
    <DashboardLayout userEmail={email}>
      <section className="space-y-6">
        {!dbReady ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Set <code>DATABASE_URL</code> to view real Insights metrics.
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-2 text-sm text-slate-600">
            Real-time usage and ingestion health for your workspace.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Projects" value={projectCount} />
          <MetricCard label="Documents" value={documentCount} />
          <MetricCard label="Chunks" value={chunkCount} />
          <MetricCard label="Ready docs" value={readyCount} />
          <MetricCard label="Failed docs" value={failedCount} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold">Top projects</h2>
          <div className="mt-3 space-y-2">
            {topProjects.length === 0 ? (
              <p className="text-sm text-slate-600">No project metrics yet.</p>
            ) : (
              topProjects.map((project) => (
                <div key={project.id} className="rounded-md border border-slate-200 p-3">
                  <p className="font-medium">{project.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {project._count.documents} docs · {project._count.conversations} conversations
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
