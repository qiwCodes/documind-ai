import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { ParsedDocumentText, ParsedPageSpan } from "@/lib/parsing/extract-text";

export type ChunkRecord = {
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  pageNumber: number | null;
};

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 120,
});

function resolveChunkStart(text: string, chunk: string, cursor: number): number {
  const searchFrom = Math.max(0, cursor - 240);
  const anchoredMatch = text.indexOf(chunk, searchFrom);
  if (anchoredMatch >= 0) {
    return anchoredMatch;
  }

  const fallbackMatch = text.indexOf(chunk);
  if (fallbackMatch >= 0) {
    return fallbackMatch;
  }

  return cursor;
}

function resolvePageNumber(pageSpans: ParsedPageSpan[], startOffset: number, endOffset: number): number | null {
  const span = pageSpans.find(
    (page) => startOffset < page.endOffset && endOffset > page.startOffset,
  );

  return span?.pageNumber ?? pageSpans.at(-1)?.pageNumber ?? null;
}

export async function chunkDocument(input: string | ParsedDocumentText): Promise<ChunkRecord[]> {
  const document =
    typeof input === "string"
      ? {
          text: input,
          pageSpans: input.trim()
            ? [{ pageNumber: 1, startOffset: 0, endOffset: input.length }]
            : [],
        }
      : input;

  if (!document.text.trim()) {
    return [];
  }

  const chunks = await splitter.splitText(document.text);
  const records: ChunkRecord[] = [];
  let cursor = 0;

  chunks.forEach((chunk, index) => {
    const start = resolveChunkStart(document.text, chunk, cursor);
    const end = start + chunk.length;
    cursor = end;

    records.push({
      chunkIndex: index,
      content: chunk,
      startOffset: start,
      endOffset: end,
      tokenCount: Math.ceil(chunk.length / 4),
      pageNumber: resolvePageNumber(document.pageSpans, start, end),
    });
  });

  return records;
}
