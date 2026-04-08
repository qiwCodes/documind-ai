"use client";

import { useEffect, useState } from "react";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import type { CitationRef } from "@/types/workspace";

type DocumentRow = {
  id: string;
  fileName: string;
  status: string;
  statusMessage?: string | null;
  _count?: { chunks: number };
};

type Conversation = { id: string; title: string | null };
type Message = { id: string; role: "user" | "assistant" | "system"; content: string };

const CITATION_MARKER = "__CITATIONS__";

function formatCitationLocation(citation: CitationRef): string {
  const parts: string[] = [];

  if (citation.pageNumber) {
    parts.push(`page ${citation.pageNumber}`);
  }

  if (citation.startOffset !== undefined && citation.startOffset !== null) {
    const endOffset = citation.endOffset ?? citation.startOffset;
    parts.push(`offset ${citation.startOffset}-${endOffset}`);
  }

  return parts.join(" · ") || "location unavailable";
}

function formatCitationScore(score?: number): string | null {
  if (typeof score !== "number") {
    return null;
  }

  return `${Math.round(score * 100)}% match`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "UPLOADED":
      return "Queued";
    case "PARSING":
      return "Parsing";
    case "CHUNKING":
      return "Chunking";
    case "EMBEDDING":
      return "Embedding";
    case "READY":
      return "Ready";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

export function ProjectWorkspaceShell({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [citations, setCitations] = useState<CitationRef[]>([]);
  const [citationsByMessageId, setCitationsByMessageId] = useState<Record<string, CitationRef[]>>({});
  const [activeCitationMessageId, setActiveCitationMessageId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeConversation = conversations.find((conversation) => conversation.id === conversationId);

  async function refreshDocuments() {
    const res = await fetch(`/api/projects/${projectId}/documents`);
    if (!res.ok) return;
    const data = (await res.json()) as { documents: DocumentRow[] };
    setDocuments(data.documents);
  }

  useEffect(() => {
    async function loadInitialData() {
      const [docsRes, convRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/documents`),
        fetch(`/api/projects/${projectId}/conversations`),
      ]);
      if (docsRes.ok) {
        const docsData = (await docsRes.json()) as { documents: DocumentRow[] };
        setDocuments(docsData.documents);
      }
      if (convRes.ok) {
        const convData = (await convRes.json()) as { conversations: Conversation[] };
        setConversations(convData.conversations);
        setConversationId((current) => current || convData.conversations[0]?.id || "");
      }
    }
    void loadInitialData();
  }, [projectId]);

  useEffect(() => {
    const hasInFlightDocuments = documents.some(
      (doc) => doc.status !== "READY" && doc.status !== "FAILED",
    );
    if (!hasInFlightDocuments) return;

    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) return;
      const data = (await res.json()) as { documents: DocumentRow[] };
      setDocuments(data.documents);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [documents, projectId]);

  useEffect(() => {
    async function loadMessages() {
      if (!conversationId) {
        setMessages([]);
        return;
      }
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages);
    }
    void loadMessages();
  }, [conversationId]);

  async function createConversation() {
    const res = await fetch(`/api/projects/${projectId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New chat" }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { conversation: Conversation };
    setConversations((prev) => [data.conversation, ...prev]);
    setConversationId(data.conversation.id);
    setMessages([]);
    return data.conversation.id;
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const fd = new FormData();
    Array.from(fileList).forEach((file) => fd.append("files", file));
    await fetch(`/api/projects/${projectId}/ingest`, { method: "POST", body: fd });
    await refreshDocuments();
  }

  async function deleteDocument(documentId: string) {
    setError(null);
    const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Delete failed");
      return;
    }
    await refreshDocuments();
  }

  async function saveRename(documentId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setError(null);
    const res = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: trimmed }),
    });
    if (!res.ok) {
      setError("Rename failed");
      return;
    }
    setRenamingId(null);
    setActionMenuId(null);
    setRenameValue("");
    await refreshDocuments();
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!input.trim()) return;
    setBusy(true);
    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        activeConversationId = await createConversation();
      }
      if (!activeConversationId) throw new Error("Create chat first");

      const userText = input.trim();
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userText }),
      });
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: userText }]);
      setInput("");

      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: userText, history }),
      });
      if (!response.ok || !response.body) throw new Error("Chat failed");

      const draftId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: draftId, role: "assistant", content: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let citationPayload = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });

        const markerIndex = full.indexOf(CITATION_MARKER);
        const visibleContent = markerIndex >= 0 ? full.slice(0, markerIndex).trimEnd() : full;
        if (markerIndex >= 0) {
          citationPayload = full.slice(markerIndex + CITATION_MARKER.length).trim();
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === draftId ? { ...m, content: visibleContent } : m)),
        );
      }
      const clean = full.split(CITATION_MARKER)[0]?.trim() ?? full.trim();
      setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, content: clean } : m)));
      await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: clean }),
      });
      if (citationPayload) {
        try {
          const parsed = JSON.parse(citationPayload) as CitationRef[];
          setCitations(parsed);
          setCitationsByMessageId((prev) => ({ ...prev, [draftId]: parsed }));
          setActiveCitationMessageId(draftId);
        } catch {
          setCitations([]);
          setCitationsByMessageId((prev) => ({ ...prev, [draftId]: [] }));
          setActiveCitationMessageId(draftId);
        }
      } else {
        setCitations([]);
        setCitationsByMessageId((prev) => ({ ...prev, [draftId]: [] }));
        setActiveCitationMessageId(draftId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid h-[calc(100vh-170px)] min-h-0 min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
      <aside className="min-w-0 space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
          <h2 className="truncate text-base font-semibold text-slate-900">{projectTitle}</h2>
        </div>
        <label className="block text-sm font-medium text-slate-700">Upload files</label>
        <input
          type="file"
          multiple
          onChange={(e) => void uploadFiles(e.target.files)}
          className="block w-full text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white"
        />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Files</p>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
              {documents.length}
            </span>
          </div>
          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              No files yet. Upload PDFs or docs to start asking questions.
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                {renamingId === doc.id ? (
                  <div className="flex gap-2">
                    <input
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void saveRename(doc.id)}
                      className="h-9 rounded-lg bg-slate-900 px-3 text-xs text-white"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-900 px-3 py-2 text-white">
                    <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-200">File</p>
                    <p className="break-words text-sm font-medium leading-5">{doc.fileName}</p>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <p
                    className={`font-medium ${
                      doc.status === "FAILED"
                        ? "text-red-600"
                        : doc.status === "READY"
                          ? "text-emerald-600"
                          : "text-indigo-600"
                    }`}
                  >
                    {statusLabel(doc.status)}
                  </p>
                  <p className="text-slate-500">{doc._count?.chunks ?? 0} chunks</p>
                </div>
                <p className="text-xs text-slate-500">{doc.statusMessage ?? "Document is ready for retrieval"}</p>
                <div className="relative flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActionMenuId((current) => (current === doc.id ? null : doc.id))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base leading-none text-slate-700"
                    aria-label="Open file actions"
                  >
                    ⋯
                  </button>
                  {actionMenuId === doc.id ? (
                    <div className="absolute top-9 z-10 w-28 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(doc.id);
                          setRenameValue(doc.fileName);
                          setActionMenuId(null);
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionMenuId(null);
                          void deleteDocument(doc.id);
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => void createConversation()}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-100"
          >
            New chat
          </button>
          <select
            value={conversationId}
            onChange={(e) => setConversationId(e.target.value)}
            className="h-10 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">Select chat</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>{c.title || "Untitled"}</option>
            ))}
          </select>
        </div>
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Chat title</p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {activeConversation?.title || (conversationId ? "Untitled" : "No chat selected")}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              Start a chat to talk with AI about your uploaded files.
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border p-3 text-sm shadow-sm ${
                  m.role === "assistant" ? "border-slate-200 bg-white" : "border-slate-200 bg-indigo-50/40"
                }`}
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.role}</p>
                {m.role === "assistant" ? (
                  <MarkdownMessage content={m.content} />
                ) : (
                  <p className="whitespace-pre-wrap break-words text-slate-800">{m.content}</p>
                )}
                {m.role === "assistant" ? (
                  <details className="mt-2">
                    <summary
                      className="cursor-pointer text-xs font-medium text-indigo-700"
                      onClick={() => {
                        setActiveCitationMessageId(m.id);
                        setCitations(citationsByMessageId[m.id] ?? []);
                      }}
                    >
                      See source
                    </summary>
                    <div className="mt-2 space-y-1">
                      {(citationsByMessageId[m.id] ?? []).length === 0 ? (
                        <p className="text-xs text-slate-500">No source for this response.</p>
                      ) : (
                        (citationsByMessageId[m.id] ?? []).map((c) => (
                          <p key={`${m.id}-${c.id}-${c.chunkId ?? ""}`} className="text-xs text-slate-600">
                            [{c.id}] {c.documentName} · {formatCitationLocation(c)}
                          </p>
                        ))
                      )}
                    </div>
                  </details>
                ) : null}
              </div>
            ))
          )}
        </div>
        <form onSubmit={sendMessage} className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message to AI..."
            className="h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
          />
          <button
            disabled={busy}
            className="h-11 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "Sending..." : "Send"}
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </main>

      <aside className="min-w-0 space-y-3 overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence</p>
          <h3 className="font-semibold text-slate-900">Sources used by AI</h3>
        </div>
        {activeCitationMessageId ? (
          <p className="text-xs text-slate-500">From assistant message: {activeCitationMessageId.slice(0, 8)}...</p>
        ) : null}
        {citations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            No citations yet. Ask a question to see supporting passages here.
          </div>
        ) : (
          citations.map((c) => (
            <div key={`${c.id}-${c.chunkId ?? ""}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="break-all font-medium text-slate-900">
                  [{c.id}] {c.documentName}
                </p>
                {formatCitationScore(c.score) ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {formatCitationScore(c.score)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatCitationLocation(c)}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-700">
                {c.quote}
              </p>
            </div>
          ))
        )}
      </aside>
    </section>
  );
}
