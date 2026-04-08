"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to create project");
      }
      const payload = (await response.json()) as { project: { id: string } };

      setTitle("");
      setDescription("");
      router.push(`/dashboard/projects/${payload.project.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unexpected error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Create project</h2>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Project name"
        required
        className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Short description (optional)"
        rows={3}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}
