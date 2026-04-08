import { Pinecone } from "@pinecone-database/pinecone";
import type { VectorDocument, VectorMatch, VectorStoreAdapter } from "./types";
import { EMBEDDING_DIMENSION } from "./env";

export class PineconeVectorAdapter implements VectorStoreAdapter {
  private readonly client: Pinecone;
  private readonly indexName: string;

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX;

    if (!apiKey || !indexName) {
      throw new Error("PINECONE_API_KEY and PINECONE_INDEX are required for Pinecone backend");
    }

    this.client = new Pinecone({ apiKey });
    this.indexName = indexName;
  }

  async upsert(params: {
    namespace: string;
    vectors: (VectorDocument & { embedding: number[] })[];
  }): Promise<void> {
    if (params.vectors.length === 0) {
      return;
    }

    const index = this.client.index(this.indexName);

    await index.namespace(params.namespace).upsert({
      records: params.vectors.map((vector) => ({
        id: vector.id,
        values: vector.embedding,
        metadata: {
          chunkId: String(vector.metadata.chunkId ?? ""),
          documentId: String(vector.metadata.documentId ?? ""),
          projectId: String(vector.metadata.projectId ?? ""),
          fileName: String(vector.metadata.fileName ?? ""),
          chunkIndex: String(vector.metadata.chunkIndex ?? ""),
        },
      })),
    });
  }

  async query(params: {
    namespace: string;
    queryEmbedding: number[];
    topK: number;
  }): Promise<VectorMatch[]> {
    if (params.queryEmbedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Pinecone query vector must be length ${EMBEDDING_DIMENSION}`);
    }

    const index = this.client.index(this.indexName);
    const response = await index.namespace(params.namespace).query({
      topK: params.topK,
      vector: params.queryEmbedding,
      includeMetadata: true,
    });

    return (response.matches ?? []).map((match) => ({
      id: match.id,
      score: typeof match.score === "number" ? match.score : 0,
      metadata: {
        chunkId: match.metadata?.chunkId,
        documentId: match.metadata?.documentId,
        projectId: match.metadata?.projectId,
        fileName: match.metadata?.fileName,
      },
    }));
  }

  async deleteNamespace(namespace: string): Promise<void> {
    const index = this.client.index(this.indexName);
    await index.namespace(namespace).deleteAll();
  }
}
