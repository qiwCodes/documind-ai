"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "@/components/workspace/sidebar";
import { SourceViewer } from "@/components/workspace/source-viewer";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import type { ChatMessage, CitationRef, DocumentSummary, ProjectSummary } from "@/types/workspace";

type ProjectsResponse = { projects: ProjectSummary[] };
type DocumentsResponse = { documents: DocumentSummary[] };

export function WorkspaceShell() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeCitation, setActiveCitation] = useState<CitationRef | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  async function fetchProjects() {
    setIsLoadingProjects(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }

      const payload = (await response.json()) as ProjectsResponse;
      setProjects(payload.projects);

      if (!activeProjectId && payload.projects[0]) {
        setActiveProjectId(payload.projects[0].id);
      }
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function fetchDocuments(projectId: string) {
    setIsLoadingDocuments(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch documents");
      }

      const payload = (await response.json()) as DocumentsResponse;
      setDocuments(payload.documents);
    } finally {
      setIsLoadingDocuments(false);
    }
  }

  async function handleCreateProject() {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Notebook ${new Date().toLocaleTimeString()}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not create project");
      }

      await fetchProjects();
    } catch {
      setErrorMessage("Could not create a new notebook. Please retry.");
    } finally {
      setIsBusy(false);
    }
  }

  async function pollDocumentsUntilIdle(projectId: string) {
    const busyStatuses = new Set<DocumentSummary["status"]>([
      "UPLOADED",
      "PARSING",
      "CHUNKING",
      "EMBEDDING",
    ]);

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const response = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" });
      if (!response.ok) {
        break;
      }

      const payload = (await response.json()) as DocumentsResponse;
      setDocuments(payload.documents);

      const stillProcessing = payload.documents.some((doc) => busyStatuses.has(doc.status));
      if (!stillProcessing) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    await fetchDocuments(projectId);
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!activeProjectId || !files || files.length === 0) {
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    const projectId = activeProjectId;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/ingest`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      if (response.status === 202) {
        await fetchProjects();
        await pollDocumentsUntilIdle(projectId);
      } else {
        await Promise.all([fetchProjects(), fetchDocuments(projectId)]);
      }
    } catch {
      setErrorMessage("Upload failed. Check file format and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    setIsHydrated(true);
    const storedTheme = window.localStorage.getItem("documind.theme");
    const darkEnabled = storedTheme === "dark";
    setIsDarkMode(darkEnabled);
    document.documentElement.classList.toggle("dark", darkEnabled);
    fetchProjects().catch(() => setErrorMessage("Failed to load notebooks."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    setActiveCitation(null);
    fetchDocuments(activeProjectId).catch(() => setErrorMessage("Failed to load project documents."));
  }, [activeProjectId]);

  useEffect(() => {
    if (!isHydrated || !activeProjectId) {
      setMessages([]);
      return;
    }

    const cached = window.localStorage.getItem(`documind.chat.${activeProjectId}`);
    if (!cached) {
      setMessages([]);
      return;
    }

    try {
      const parsed = JSON.parse(cached) as ChatMessage[];
      setMessages(parsed);
    } catch {
      setMessages([]);
    }
  }, [activeProjectId, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !activeProjectId) {
      return;
    }

    window.localStorage.setItem(`documind.chat.${activeProjectId}`, JSON.stringify(messages));
  }, [messages, activeProjectId, isHydrated]);

  function handleToggleTheme() {
    const nextIsDark = !isDarkMode;
    setIsDarkMode(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    window.localStorage.setItem("documind.theme", nextIsDark ? "dark" : "light");
  }

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="border-b px-4 py-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Documind AI Workspace</p>
          <ThemeToggle isDark={isDarkMode} onToggle={handleToggleTheme} />
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid h-[calc(100vh-49px)] grid-cols-12">
        <div className="col-span-3 min-w-0">
          <WorkspaceSidebar
            projects={projects}
            activeProjectId={activeProjectId}
            documents={documents}
            onSelectProject={setActiveProjectId}
            onCreateProject={handleCreateProject}
            onUploadFiles={handleUploadFiles}
            isBusy={isBusy}
            isLoading={isLoadingProjects}
          />
        </div>

        <div className="col-span-5 min-w-0">
          <SourceViewer
            documents={documents}
            activeCitation={activeCitation}
            isLoading={isLoadingDocuments}
          />
        </div>

        <div className="col-span-4 min-w-0">
          <ChatPanel
            projectId={activeProjectId}
            documents={documents}
            messages={messages}
            onMessagesChange={setMessages}
            onCitationClick={setActiveCitation}
          />
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-card/90 px-4 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
        {activeProject ? `Active notebook: ${activeProject.title}` : "Create your first notebook"}
      </div>
    </main>
  );
}
