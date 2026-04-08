export type ProjectSummary = {
  id: string;
  title: string;
  description: string | null;
  vectorNamespace: string;
  _count?: {
    documents: number;
    conversations: number;
  };
};

export type DocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  status: "UPLOADED" | "PARSING" | "CHUNKING" | "EMBEDDING" | "READY" | "FAILED";
  statusMessage: string | null;
  _count?: {
    chunks: number;
  };
};

export type CitationRef = {
  id: number;
  documentId: string;
  documentName: string;
  chunkId?: string;
  quote: string;
  score?: number;
  pageNumber?: number | null;
  startOffset?: number | null;
  endOffset?: number | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationRef[];
};
