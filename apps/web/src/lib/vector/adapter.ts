import { getVectorBackend } from "./env";
import { InMemoryVectorAdapter } from "./in-memory-adapter";
import { PgVectorAdapter } from "./pgvector";
import { PineconeVectorAdapter } from "./pinecone-adapter";
import type { VectorStoreAdapter } from "./types";

let cachedAdapter: VectorStoreAdapter | null = null;
let cacheKey = "";

export function getVectorAdapter(): VectorStoreAdapter {
  const backend = getVectorBackend();
  const key = `${backend}:${process.env.PINECONE_INDEX ?? ""}`;

  if (cachedAdapter && cacheKey === key) {
    return cachedAdapter;
  }

  cacheKey = key;

  if (backend === "pgvector") {
    cachedAdapter = new PgVectorAdapter();
  } else if (backend === "pinecone") {
    cachedAdapter = new PineconeVectorAdapter();
  } else {
    cachedAdapter = new InMemoryVectorAdapter();
  }

  return cachedAdapter;
}
