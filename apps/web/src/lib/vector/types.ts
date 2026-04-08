export type VectorDocument = {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

export type VectorMatch = {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
};

export interface VectorStoreAdapter {
  upsert(params: {
    namespace: string;
    vectors: VectorDocument[];
  }): Promise<void>;
  query(params: {
    namespace: string;
    queryEmbedding: number[];
    topK: number;
  }): Promise<VectorMatch[]>;
  deleteNamespace(namespace: string): Promise<void>;
}
