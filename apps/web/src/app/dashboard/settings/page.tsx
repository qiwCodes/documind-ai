import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { UserPreferencesForm } from "@/components/dashboard/UserPreferencesForm";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/client";
import { isDatabaseConfigured } from "@/lib/db/runtime";
import { safeDbQuery } from "@/lib/db/safe-query";

export default async function SettingsPage() {
  const { email } = await requireUser("/dashboard/settings");
  const dbReady = isDatabaseConfigured();
  const projects = dbReady
    ? await safeDbQuery(
        () =>
          prisma.project.findMany({
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              title: true,
            },
          }),
        [],
      )
    : [];

  const environmentChecks = [
    { key: "DATABASE_URL", configured: Boolean(process.env.DATABASE_URL) },
    { key: "GROQ_API_KEY", configured: Boolean(process.env.GROQ_API_KEY) },
    {
      key: "OPENAI_EMBEDDING_API_KEY",
      configured: Boolean(process.env.OPENAI_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY),
    },
    { key: "OPENAI_API_KEY", configured: Boolean(process.env.OPENAI_API_KEY) },
    {
      key: "NEXT_PUBLIC_SUPABASE_URL",
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    },
    {
      key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    {
      key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      configured: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    },
    { key: "CLERK_SECRET_KEY", configured: Boolean(process.env.CLERK_SECRET_KEY) },
  ];

  return (
    <DashboardLayout userEmail={email}>
      <section className="space-y-6">
        {!dbReady ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Set <code>DATABASE_URL</code> to enable project-aware settings.
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage user preferences and verify critical integration configuration.
          </p>
        </div>

        {dbReady ? <UserPreferencesForm projects={projects} /> : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold">Environment readiness</h2>
          <div className="mt-3 space-y-2">
            {environmentChecks.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <span>{item.key}</span>
                <span className={item.configured ? "text-emerald-700" : "text-amber-700"}>
                  {item.configured ? "Configured" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Ingestion mode: <span className="font-medium">{process.env.INGEST_ASYNC !== "false" ? "async" : "sync"}</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          LLM (chat): <span className="font-medium">{process.env.GROQ_API_KEY ? "Groq" : process.env.OPENAI_API_KEY ? "OpenAI" : "Fallback"}</span>
          {" · "}
          Embeddings: <span className="font-medium">{process.env.OPENAI_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY ? "OpenAI" : "Lexical fallback"}</span>
        </div>
      </section>
    </DashboardLayout>
  );
}
