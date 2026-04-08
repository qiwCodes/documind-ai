"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { CitationChip } from "@/components/citations/citation-chip";
import { Button } from "@/components/ui/button";
import type { ChatMessage, CitationRef, DocumentSummary } from "@/types/workspace";

type ChatPanelProps = {
  projectId: string | null;
  documents: DocumentSummary[];
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  onCitationClick: (citation: CitationRef) => void;
};

const quickActions = [
  { id: "summarize", label: "Summarize" },
  { id: "contradictions", label: "Find Contradictions" },
  { id: "study_guide", label: "Create Study Guide" },
] as const;

const CITATION_MARKER = "__CITATIONS__";

export function ChatPanel(props: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);

  async function sendMessage(action?: string) {
    const text = action ? input.trim() || "Run quick action on current notebook" : input.trim();
    if (!text || isStreaming || !props.projectId) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantId = crypto.randomUUID();
    let nextMessages: ChatMessage[] = [
      ...props.messages,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ];

    props.onMessagesChange(nextMessages);
    setInput("");
    setIsStreaming(true);
    setStreamError(null);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: props.projectId,
          message: text,
          action,
          history: props.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Streaming failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamed = "";
      let citationPayload = "";

      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;

        if (chunk.value) {
          streamed += decoder.decode(chunk.value, { stream: true });
          const markerIndex = streamed.indexOf(CITATION_MARKER);

          const visibleContent =
            markerIndex >= 0 ? streamed.slice(0, markerIndex).trimEnd() : streamed;

          if (markerIndex >= 0) {
            citationPayload = streamed.slice(markerIndex + CITATION_MARKER.length).trim();
          }

          nextMessages = nextMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: visibleContent,
                }
              : message,
          );

          props.onMessagesChange(nextMessages);
        }
      }

      if (citationPayload) {
        try {
          const citations = JSON.parse(citationPayload) as CitationRef[];
          nextMessages = nextMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  citations,
                }
              : message,
          );
          props.onMessagesChange(nextMessages);
        } catch {
          setStreamError("Citation payload parsing failed.");
        }
      }
    } catch {
      setStreamError("Streaming failed. Please retry.");
      nextMessages = nextMessages.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: "Streaming failed. Please retry.",
            }
          : message,
      );
      props.onMessagesChange(nextMessages);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <section className="flex h-full flex-col border-l bg-card">
      <header className="border-b p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Chat</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Context-aware assistant with citation-aware responses.
        </p>
        {!props.projectId ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
            Select a notebook to enable chat.
          </p>
        ) : null}
        {streamError ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{streamError}</p> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => sendMessage(action.id)}
              disabled={isStreaming || !props.projectId}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {props.messages.length === 0 ? (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            Ask anything across your uploaded documents.
          </p>
        ) : null}

        {props.messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border p-3 text-sm ${
              message.role === "assistant" ? "bg-background" : "bg-primary/5"
            }`}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {message.role}
            </p>
            {message.role === "assistant" ? (
              <MarkdownMessage content={message.content} className="text-foreground" />
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            )}

            {message.citations?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.citations.map((citation) => (
                  <CitationChip
                    key={`${message.id}-${citation.id}`}
                    citation={citation}
                    onOpenSource={props.onCitationClick}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <footer className="border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Compare concept X in file A and file B..."
            className="min-h-[84px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring"
          />
          <Button onClick={() => sendMessage()} disabled={!canSend || !props.projectId}>
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </Button>
        </div>
      </footer>
    </section>
  );
}
