"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ProjectOption = {
  id: string;
  title: string;
};

type DocumentUploaderProps = {
  projects: ProjectOption[];
};

export function DocumentUploader({ projects }: DocumentUploaderProps) {
  const router = useRouter();
  const initialProjectId = useMemo(() => projects[0]?.id ?? "", [projects]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [files, setFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!projectId) {
      setError("Please select a project");
      return;
    }

    if (!files || files.length === 0) {
      setError("Please choose at least one file");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append("files", file);
      }

      const response = await fetch(`/api/projects/${projectId}/ingest`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | { count?: number; error?: string; mode?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Upload failed");
      }

      const count = payload?.count ?? files.length;
      const mode = payload?.mode ?? "async";
      setStatus(`Accepted ${count} file(s) (${mode})`);
      setFiles(null);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unexpected upload error");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Upload documents</h2>
      <select
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
      >
        {projects.length === 0 ? <option value="">No projects</option> : null}
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title}
          </option>
        ))}
      </select>
      <input
        type="file"
        multiple
        onChange={(event) => setFiles(event.target.files)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:text-white"
      />
      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={isUploading || projects.length === 0}
        className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {isUploading ? "Uploading..." : "Start ingestion"}
      </button>
    </form>
  );
}
