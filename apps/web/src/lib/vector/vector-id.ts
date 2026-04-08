import { createHash } from "node:crypto";

export function buildVectorId(source: {
  projectId: string;
  documentId: string;
  chunkIndex: number;
}): string {
  const raw = `${source.projectId}:${source.documentId}:${source.chunkIndex}`;
  return createHash("sha1").update(raw).digest("hex");
}
