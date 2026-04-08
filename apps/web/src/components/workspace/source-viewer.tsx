"use client";

import { useEffect, useRef } from "react";
import type { CitationRef, DocumentSummary } from "@/types/workspace";
import { cn } from "@/lib/utils";

type SourceViewerProps = {
  documents: DocumentSummary[];
  activeCitation: CitationRef | null;
  isLoading?: boolean;
};

export function SourceViewer(props: SourceViewerProps) {
  const activeCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!props.activeCitation?.documentId) {
      return;
    }

    activeCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [props.activeCitation?.documentId]);

  return (
    <section className="flex h-full flex-col bg-background">
      <header className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Source-First Viewer</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Hover citation chips for a quick preview; click to focus the matching source.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {props.isLoading ? (
          <div className="mb-4 animate-pulse rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            Refreshing sources...
          </div>
        ) : null}

        {props.activeCitation ? (
          <div className="mb-4 animate-in fade-in slide-in-from-top-2 rounded-lg border border-primary/35 bg-primary/5 p-4 duration-200">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Active citation [{props.activeCitation.id}]
            </p>
            <p className="mt-1 text-sm font-medium">{props.activeCitation.documentName}</p>
            <p className="mt-2 max-h-36 overflow-y-auto rounded-md bg-background/80 p-2 text-xs leading-relaxed text-muted-foreground">
              {props.activeCitation.quote}
            </p>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            No citation selected yet.
          </div>
        )}

        <div className="space-y-3">
          {props.documents.map((document) => {
            const isLinked = props.activeCitation?.documentId === document.id;

            return (
              <article
                key={document.id}
                id={`source-doc-${document.id}`}
                ref={
                  isLinked
                    ? (node) => {
                        activeCardRef.current = node;
                      }
                    : undefined
                }
                className={cn(
                  "rounded-xl border p-4 transition-all duration-200",
                  isLinked
                    ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/15"
                    : "border-border hover:border-primary/20 hover:bg-muted/30",
                )}
              >
                <p className="text-sm font-medium">{document.fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status: {document.status} · Chunks: {document._count?.chunks ?? 0}
                </p>
                {isLinked ? (
                  <p className="mt-3 rounded-md bg-background/80 p-2 text-xs text-muted-foreground">
                    This document matches the active citation. Scroll the quote card above for the exact excerpt.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
