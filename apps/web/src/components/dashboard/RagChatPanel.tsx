"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

type ProjectOption = {
  id: string;
  title: string;
};

type RagChatPanelProps = {
  projects: ProjectOption[];
};

type Conversation = {
  id: string;
  title: string | null;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

const CITATION_MARKER = "__CITATIONS__";

export function RagChatPanel({ projects }: RagChatPanelProps) {
  const defaultProject = useMemo(() => projects[0]?.id ?? "", [projects]);
  const [projectId, setProjectId] = useState(defaultProject);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProject = Boolean(projectId);
  const hasConversation = Boolean(conversationId);

  useEffect(() => {
    async function loadConversations() {
      if (!projectId) {
        setConversations([]);
        setConversationId("");
        setMessages([]);
        return;
      }

      const response = await fetch(`/api/projects/${projectId}/conversations`);
      if (!response.ok) {
        setConversations([]);
        return;
      }

      const payload = (await response.json()) as { conversations: Conversation[] };
      setConversations(payload.conversations);
      setConversationId((current) => current || payload.conversations[0]?.id || "");
    }

    void loadConversations();
  }, [projectId]);

  useEffect(() => {
    async function loadMessages() {
      if (!conversationId) {
        setMessages([]);
        return;
      }

      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!response.ok) {
        setMessages([]);
        return;
      }

      const payload = (await response.json()) as { messages: Message[] };
      setMessages(payload.messages);
    }

    void loadMessages();
  }, [conversationId]);

  async function createConversation() {
    if (!projectId) return "";

    setIsCreatingConversation(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
      });
      if (!response.ok) {
        throw new Error("Unable to create chat");
      }
      const payload = (await response.json()) as { conversation: Conversation };
      const newConversation = payload.conversation;
      setConversations((prev) => [newConversation, ...prev]);
      setConversationId(newConversation.id);
      setMessages([]);
      return newConversation.id;
    } catch (conversationError) {
      setError(conversationError instanceof Error ? conversationError.message : "Unexpected error");
      return "";
    } finally {
      setIsCreatingConversation(false);
    }
  }

  async function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!projectId) {
      setError("Please select a project");
      return;
    }

    if (!question.trim()) {
      setError("Please enter a question");
      return;
    }

    setIsLoading(true);

    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        activeConversationId = await createConversation();
      }
      if (!activeConversationId) {
        throw new Error("Please create a chat first");
      }

      const userMessage = question.trim();
      const history = messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        }));

      await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userMessage }),
      });

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: userMessage }]);
      setQuestion("");

      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: userMessage,
          history,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      const assistantDraftId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantDraftId, role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantDraftId ? { ...message, content: fullText } : message,
          ),
        );
      }

      const cleanText = fullText.split(CITATION_MARKER)[0]?.trim() ?? fullText;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantDraftId ? { ...message, content: cleanText } : message,
        ),
      );

      await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: cleanText }),
      });
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Unexpected chat error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-base font-semibold">RAG Chat</h2>
        <p className="mt-1 text-sm text-slate-600">
          Step 1: Select project, Step 2: Create/select chat, Step 3: Ask your question.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void createConversation()}
          disabled={!hasProject || isCreatingConversation}
          className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm disabled:opacity-60"
        >
          {isCreatingConversation ? "Creating..." : "New chat"}
        </button>
        <select
          value={conversationId}
          onChange={(event) => setConversationId(event.target.value)}
          className="h-9 min-w-52 rounded-md border border-slate-200 px-3 text-sm"
        >
          <option value="">{hasProject ? "Select chat" : "Select project first"}</option>
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title || "Untitled chat"}
            </option>
          ))}
        </select>
      </div>
      <form onSubmit={askQuestion} className="space-y-3">
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
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          placeholder={hasConversation ? "Ask something about your documents..." : "Create/select chat before asking"}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={isLoading || projects.length === 0 || isCreatingConversation || !hasConversation}
          className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {isLoading ? "Generating..." : "Send"}
        </button>
      </form>
      <div className="min-h-32 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
        {messages.length === 0 ? (
          <p className="text-slate-600">
            {!hasProject
              ? "Start by selecting a project."
              : !hasConversation
                ? "Create or select a chat to begin."
                : "No messages yet. Ask your first question."}
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="rounded-md border border-slate-200 bg-white p-2">
              <p className="mb-1 text-xs uppercase text-slate-500">{message.role}</p>
              {message.role === "assistant" ? (
                <MarkdownMessage content={message.content} />
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
