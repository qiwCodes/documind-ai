"use client";

import { BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CitationRef } from "@/types/workspace";
import { cn } from "@/lib/utils";

type CitationChipProps = {
  citation: CitationRef;
  onOpenSource: (citation: CitationRef) => void;
};

export function CitationChip(props: CitationChipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary transition",
            "hover:bg-primary/10 hover:shadow-sm",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
          onClick={() => props.onOpenSource(props.citation)}
        >
          <BookOpen className="h-3 w-3 opacity-70" />
          [{props.citation.id}]
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-80 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Source</p>
        <p className="text-sm font-medium leading-snug">{props.citation.documentName}</p>
        {typeof props.citation.score === "number" ? (
          <p className="text-[11px] text-muted-foreground">Relevance: {(props.citation.score * 100).toFixed(1)}%</p>
        ) : null}
        <p className="max-h-40 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
          {props.citation.quote}
        </p>
        <p className="text-[10px] text-muted-foreground">Click the chip again to refocus the source panel.</p>
      </PopoverContent>
    </Popover>
  );
}
