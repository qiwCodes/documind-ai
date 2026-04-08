"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ProjectItem = {
  id: string;
  title: string;
  description: string | null;
  _count: {
    documents: number;
  };
};

export function ProjectListManager({ initialProjects }: { initialProjects: ProjectItem[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(project: ProjectItem) {
    setEditingId(project.id);
    setTitle(project.title);
    setDescription(project.description ?? "");
    setError(null);
  }

  async function saveEdit(projectId: string) {
    setBusyId(projectId);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Update failed");
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                title: title.trim(),
                description: description.trim() || null,
              }
            : project,
        ),
      );
      setEditingId(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  }

  async function removeProject(projectId: string) {
    setBusyId(projectId);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Delete failed");
      }
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {projects.length === 0 ? (
        <p className="text-sm text-slate-600">No projects yet. Create one to begin.</p>
      ) : (
        projects.map((project) => (
          <div key={project.id} className="rounded-md border border-slate-200 p-3">
            {editingId === project.id ? (
              <div className="space-y-2">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
                />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEdit(project.id)}
                    disabled={busyId === project.id}
                    className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="block rounded transition hover:text-indigo-700"
                >
                  <p className="font-medium">{project.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{project.description || "No description"}</p>
                  <p className="mt-1 text-xs text-slate-500">{project._count.documents} document(s)</p>
                </Link>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(project)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeProject(project.id)}
                    disabled={busyId === project.id}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
