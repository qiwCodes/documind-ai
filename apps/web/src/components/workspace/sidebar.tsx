"use client";

import { FileUp, Library, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentSummary, ProjectSummary } from "@/types/workspace";

type SidebarProps = {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  documents: DocumentSummary[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onUploadFiles: (files: FileList | null) => void;
  isBusy?: boolean;
  isLoading?: boolean;
};

const statusColorMap: Record<DocumentSummary["status"], string> = {
  UPLOADED: "text-slate-500",
  PARSING: "text-blue-500",
  CHUNKING: "text-indigo-500",
  EMBEDDING: "text-violet-500",
  READY: "text-emerald-500",
  FAILED: "text-rose-500",
};

export function WorkspaceSidebar(props: SidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col border-r bg-card">
      <div className="border-b p-4">
        <div className="mb-3 flex items-center gap-2">
          <Library className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Notebooks</h2>
        </div>
        <Button className="w-full justify-start" onClick={props.onCreateProject} disabled={props.isBusy}>
          <Plus className="mr-2 h-4 w-4" />
          New Notebook
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {props.isLoading ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Loading notebooks...
            </p>
          ) : null}

          {props.projects.map((project) => {
            const isActive = project.id === props.activeProjectId;

            return (
              <button
                key={project.id}
                type="button"
                className={`w-full rounded-lg border p-3 text-left transition ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
                onClick={() => props.onSelectProject(project.id)}
              >
                <p className="truncate text-sm font-medium">{project.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(project._count?.documents ?? 0).toString()} docs
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</p>
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary">
              <FileUp className="h-3.5 w-3.5" />
              Upload
              <input
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                onChange={(event) => props.onUploadFiles(event.target.files)}
                disabled={!props.activeProjectId || props.isBusy}
              />
            </label>
          </div>

          <div className="space-y-2">
            {props.documents.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {props.activeProjectId ? "Upload files to start retrieval." : "Select or create a notebook."}
              </p>
            ) : null}

            {props.documents.map((doc) => (
              <div key={doc.id} className="rounded-md border p-2.5">
                <p className="truncate text-xs font-medium">{doc.fileName}</p>
                <p className={`mt-1 text-[11px] ${statusColorMap[doc.status]}`}>
                  {doc.status} {doc._count?.chunks ? `(${doc._count.chunks} chunks)` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
