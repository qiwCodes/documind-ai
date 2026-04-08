"use client";

import { useMemo, useState } from "react";

const STORAGE_KEY = "documind:dashboard:defaultProject";

type Option = {
  id: string;
  title: string;
};

type UserPreferencesFormProps = {
  projects: Option[];
};

export function UserPreferencesForm({ projects }: UserPreferencesFormProps) {
  const initialProjectId = useMemo(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
    return projects[0]?.id ?? "";
  }, [projects]);
  const [defaultProjectId, setDefaultProjectId] = useState(initialProjectId);
  const [saved, setSaved] = useState(false);

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!defaultProjectId) return;
    window.localStorage.setItem(STORAGE_KEY, defaultProjectId);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={onSave} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">User preferences</h2>
      <p className="text-sm text-slate-600">Save your default project for dashboard sessions.</p>
      <select
        value={defaultProjectId}
        onChange={(event) => setDefaultProjectId(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
      >
        {projects.length === 0 ? <option value="">No projects</option> : null}
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!defaultProjectId}
        className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-60"
      >
        Save preferences
      </button>
      {saved ? <p className="text-sm text-emerald-700">Saved</p> : null}
    </form>
  );
}
