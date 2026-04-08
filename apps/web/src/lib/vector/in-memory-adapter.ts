import type { VectorDocument, VectorMatch, VectorStoreAdapter } from "./types";

const store = new Map<string, Array<VectorDocument & { embedding: number[] }>>();

function cosineSimilarity(a: number[], b: number[]): number {
  const max = Math.max(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < max; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

export class InMemoryVectorAdapter implements VectorStoreAdapter {
  async upsert(params: {
    namespace: string;
    vectors: (VectorDocument & { embedding: number[] })[];
  }): Promise<void> {
    const current = store.get(params.namespace) ?? [];
    const byId = new Map(current.map((item) => [item.id, item]));

    for (const vector of params.vectors) {
      byId.set(vector.id, vector);
    }

    store.set(params.namespace, [...byId.values()]);
  }

  async query(params: {
    namespace: string;
    queryEmbedding: number[];
    topK: number;
  }): Promise<VectorMatch[]> {
    const namespaceData = store.get(params.namespace) ?? [];

    const ranked = namespaceData
      .map((item) => ({
        id: item.id,
        score: cosineSimilarity(params.queryEmbedding, item.embedding),
        metadata: item.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK);

    return ranked;
  }

  async deleteNamespace(namespace: string): Promise<void> {
    store.delete(namespace);
  }
}
