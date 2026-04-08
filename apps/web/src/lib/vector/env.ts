export type VectorBackend = "memory" | "pgvector" | "pinecone";

export function getVectorBackend(): VectorBackend {
  const raw = process.env.VECTOR_BACKEND?.toLowerCase().trim();

  if (raw === "pgvector" || raw === "pinecone" || raw === "memory") {
    return raw;
  }

  if (process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX) {
    return "pinecone";
  }

  return "memory";
}

export const EMBEDDING_DIMENSION = 1536;
