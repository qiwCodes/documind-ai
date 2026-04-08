import { prisma } from "@/lib/db/client";
import { embedTexts, hasOpenAIEmbeddingsConfigured } from "@/lib/ai/embeddings";
import { countOccurrences, extractSearchTerms, normalizeSearchText } from "@/lib/rag/query-utils";
import { cleanDocumentTextForReading, normalizeDocumentTextForSearch } from "@/lib/text/document-cleanup";
import { getVectorAdapter } from "@/lib/vector/adapter";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
  pageNumber: number | null;
  startOffset: number | null;
  endOffset: number | null;
};

type ChunkCandidate = Awaited<ReturnType<typeof fetchProjectChunksForLexicalSearch>>[number];
type RetrievalQueryAnalysis = {
  normalizedQuery: string;
  searchTerms: string[];
  isPersonList: boolean;
  isComparison: boolean;
  isMetric: boolean;
  requiresBroadCoverage: boolean;
  prefersDocumentDiversity: boolean;
  expectsNumericEvidence: boolean;
  isDefinition: boolean;
};

const MAX_LEXICAL_SCAN_CHUNKS = 2500;
const PERSON_TITLE_PATTERN =
  /(?:^|[^\p{L}\p{N}\p{M}])((?:นาย|นางสาว|นาง|อาจารย์(?:\s+ดร\.?)?|ดร\.?)\s*[\p{L}\p{M}]{2,}(?:\s+[\p{L}\p{M}]{2,}){0,4})(?=$|[^\p{L}\p{N}\p{M}])/gu;

async function fetchProjectChunksForLexicalSearch(projectId: string) {
  return prisma.documentChunk.findMany({
    where: { projectId },
    include: {
      document: {
        select: {
          id: true,
          fileName: true,
        },
      },
    },
    orderBy: [{ pageNumber: "asc" }, { chunkIndex: "asc" }],
    take: MAX_LEXICAL_SCAN_CHUNKS,
  });
}

function isPersonListQuery(query: string): boolean {
  return /รายชื่อ|บุคคล|ใครบ้าง|ชื่อ|นามสกุล|ชื่อสกุล|full names?|people|person/.test(
    query.toLowerCase(),
  );
}

function analyzeRetrievalQuery(query: string): RetrievalQueryAnalysis {
  const normalizedQuery = normalizeSearchText(query);
  const lowered = query.toLowerCase();
  const isPersonList = isPersonListQuery(query);
  const isComparison =
    /เปรียบเทียบ|compare|ต่างกัน|difference|versus|เทียบ|ดีกว่า|pairwise|judge|ขัดแย้ง|contradiction/.test(
      lowered,
    );
  const isMetric =
    /bleu|rouge|accuracy|precision|recall|f1|auc|mae|mse|rmse|wer|cer|score|metric|benchmark|correctness|relevance|naturalness|completeness|faithfulness|instruction following|pairwise/.test(
      lowered,
    ) || /คะแนน|เมตริก|ตัวชี้วัด|ผลประเมิน|ผลลัพธ์|ประสิทธิภาพ/.test(lowered);
  const requiresBroadCoverage =
    isComparison ||
    /ทั้งหมด|ทุก|รายการ|list|ใครบ้าง|อะไรบ้าง|สรุป|overview|ภาพรวม|หัวข้อ|criterion|criteria/.test(lowered);
  const expectsNumericEvidence =
    isMetric || /กี่|เท่าไร|เท่าไหร่|จำนวน|คะแนน|percent|เปอร์เซ็นต์|score|rate/.test(lowered);
  const isDefinition = /คืออะไร|คือใคร|หมายถึง|what is|define|definition/.test(lowered);

  return {
    normalizedQuery,
    searchTerms: extractSearchTerms(query),
    isPersonList,
    isComparison,
    isMetric,
    requiresBroadCoverage,
    prefersDocumentDiversity: isComparison,
    expectsNumericEvidence,
    isDefinition,
  };
}

function isTableOfContentsChunk(text: string): boolean {
  return /สารบัญ|สารบัญภาพ|สารบัญตาราง/.test(text);
}

async function getPersonLexicalMatches(params: {
  projectId: string;
  topK: number;
}): Promise<RetrievedChunk[]> {
  const candidates = await fetchProjectChunksForLexicalSearch(params.projectId);

  const ranked = candidates
    .map((chunk) => {
      const readableContent = cleanDocumentTextForReading(chunk.content);
      if (!readableContent || isTableOfContentsChunk(readableContent) || /ภาพที่\d|ตารางที่\d/.test(readableContent)) {
        return null;
      }

      const compactContent = readableContent.replace(/[^\p{L}\p{N}]+/gu, "");
      const hasPersonField =
        /ผู้เขียน(?=นาย|นางสาว|นาง|อาจารย์|ดร|[ก-๙])|ผู้จัดทำ(?=โครงงาน|ชื่อ|นาย|นางสาว|นาง|อาจารย์|ดร)|อาจารย์ที่ปรึกษา(?=นาย|นางสาว|นาง|อาจารย์|ดร)|พนักงานที่ปรึกษา(?=ชื่อ|นาย|นางสาว|นาง|อาจารย์|ดร)|ชื่อสกุล(?=นาย|นางสาว|นาง|อาจารย์|ดร)|กรรมการสอบ(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประธานกรรมการสอบ(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประธานสหกิจศึกษาสาขาวิชา(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประวัติผู้จัดทำโครงงาน/u.test(
          compactContent,
        );
      const titledNameCount = [...readableContent.matchAll(PERSON_TITLE_PATTERN)].length;

      if (!hasPersonField && titledNameCount === 0) {
        return null;
      }

      const score =
        (hasPersonField ? 20 : 0) +
        Math.min(titledNameCount, 4) * 8 +
        ((chunk.pageNumber ?? 999) <= 5 || (chunk.pageNumber ?? 0) >= 80 ? 6 : 0);

      return {
        chunkId: chunk.id,
        documentId: chunk.document.id,
        documentName: chunk.document.fileName,
        content: readableContent,
        score,
        pageNumber: chunk.pageNumber,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      } satisfies RetrievedChunk;
    })
    .filter((item): item is RetrievedChunk => Boolean(item))
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return [];
  }

  const maxScore = ranked[0]!.score || 1;

  return ranked.slice(0, params.topK).map((item) => ({
    ...item,
    score: Math.min(0.999, item.score / maxScore),
  }));
}

function scoreLexicalMatch(chunk: ChunkCandidate, analysis: RetrievalQueryAnalysis): number {
  const readableContent = cleanDocumentTextForReading(chunk.content);
  const searchableContent = normalizeDocumentTextForSearch(chunk.content);
  if (!searchableContent) {
    return 0;
  }

  const personQuery = analysis.isPersonList;
  let score = 0;

  if (personQuery) {
    if (isTableOfContentsChunk(readableContent) || /ภาพที่\d|ตารางที่\d/.test(readableContent)) {
      return 0;
    }

    const compactContent = readableContent.replace(/[^\p{L}\p{N}]+/gu, "");
    const hasPersonField =
      /ผู้เขียน(?=นาย|นางสาว|นาง|อาจารย์|ดร|[ก-๙])|ผู้จัดทำ(?=โครงงาน|ชื่อ|นาย|นางสาว|นาง|อาจารย์|ดร)|อาจารย์ที่ปรึกษา(?=นาย|นางสาว|นาง|อาจารย์|ดร)|พนักงานที่ปรึกษา(?=ชื่อ|นาย|นางสาว|นาง|อาจารย์|ดร)|ชื่อสกุล(?=นาย|นางสาว|นาง|อาจารย์|ดร)|กรรมการสอบ(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประธานกรรมการสอบ(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประธานสหกิจศึกษาสาขาวิชา(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประวัติผู้จัดทำโครงงาน/.test(
        compactContent,
      );
    const titledNameCount = [...readableContent.matchAll(PERSON_TITLE_PATTERN)].length;

    if (hasPersonField) {
      score += 18;
    }

    if (titledNameCount > 0) {
      score += Math.min(titledNameCount, 4) * 8;
    }

    if (score === 0) {
      return 0;
    }

    if ((chunk.pageNumber ?? 999) <= 5 || (chunk.pageNumber ?? 0) >= 80) {
      score += 6;
    }

    return score;
  }

  if (analysis.normalizedQuery && searchableContent.includes(analysis.normalizedQuery)) {
    score += 20;
  }

  let matchedTerms = 0;
  for (const term of analysis.searchTerms) {
    const normalizedTerm = normalizeDocumentTextForSearch(term);
    if (!normalizedTerm) {
      continue;
    }

    const occurrences = countOccurrences(searchableContent, normalizedTerm);
    if (!occurrences) {
      continue;
    }

    matchedTerms += 1;
    score += Math.min(occurrences, 4) * Math.min(4.2, Math.max(1.4, term.length / 3));
  }

  if (analysis.searchTerms.length > 0) {
    score += (matchedTerms / analysis.searchTerms.length) * 8;
  }

  if (analysis.requiresBroadCoverage && matchedTerms >= 2) {
    score += 5;
  }

  if (
    analysis.isComparison &&
    /pairwise|correctness|relevance|naturalness|completeness|faithfulness|instruction following|ดีกว่า|น้อยกว่า|มากกว่า|เปรียบเทียบ|เทียบ/u.test(
      readableContent.toLowerCase(),
    )
  ) {
    score += 6;
  }

  if (analysis.expectsNumericEvidence && /\d+(?:\.\d+)?\s*(?:%|คะแนน|ครั้ง|ms|s)?/u.test(readableContent)) {
    score += 4;
  }

  if (analysis.isDefinition && readableContent.length >= 80 && readableContent.length <= 1200) {
    score += 3;
  }

  if (isTableOfContentsChunk(readableContent)) {
    score -= 6;
  }

  if (readableContent.length < 32) {
    score -= 4;
  }

  return score;
}

async function getLexicalMatches(params: {
  projectId: string;
  query: string;
  topK: number;
}): Promise<RetrievedChunk[]> {
  const analysis = analyzeRetrievalQuery(params.query);
  const candidates = await fetchProjectChunksForLexicalSearch(params.projectId);

  const ranked = candidates
    .map((chunk) => ({
      chunk,
      rawScore: scoreLexicalMatch(chunk, analysis),
    }))
    .filter((result) => result.rawScore > 0)
    .sort((left, right) => right.rawScore - left.rawScore);

  if (ranked.length === 0) {
    return [];
  }

  const maxScore = ranked[0]!.rawScore;

  return ranked.slice(0, params.topK).map(({ chunk, rawScore }) => ({
    chunkId: chunk.id,
    documentId: chunk.document.id,
    documentName: chunk.document.fileName,
    content: cleanDocumentTextForReading(chunk.content),
    score: Math.min(0.999, rawScore / maxScore),
    pageNumber: chunk.pageNumber,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
  }));
}

function computeCoverageBoost(chunk: RetrievedChunk, analysis: RetrievalQueryAnalysis): number {
  const searchableContent = normalizeDocumentTextForSearch(chunk.content);
  if (!searchableContent) {
    return 0;
  }

  let boost = 0;
  let matchedTerms = 0;

  if (analysis.normalizedQuery && searchableContent.includes(analysis.normalizedQuery)) {
    boost += 0.22;
  }

  for (const term of analysis.searchTerms) {
    const normalizedTerm = normalizeDocumentTextForSearch(term);
    if (!normalizedTerm) {
      continue;
    }

    if (searchableContent.includes(normalizedTerm)) {
      matchedTerms += 1;
    }
  }

  if (analysis.searchTerms.length > 0) {
    boost += (matchedTerms / analysis.searchTerms.length) * 0.24;
  }

  if (analysis.expectsNumericEvidence && /\d+(?:\.\d+)?\s*(?:%|คะแนน|ครั้ง|ms|s)?/u.test(chunk.content)) {
    boost += 0.06;
  }

  if (
    analysis.isComparison &&
    /pairwise|correctness|relevance|naturalness|completeness|faithfulness|instruction following|ดีกว่า|น้อยกว่า|มากกว่า|เปรียบเทียบ|เทียบ/u.test(
      chunk.content.toLowerCase(),
    )
  ) {
    boost += 0.08;
  }

  if (analysis.isDefinition && chunk.content.length >= 80 && chunk.content.length <= 1200) {
    boost += 0.04;
  }

  if (chunk.content.length >= 60 && chunk.content.length <= 1800) {
    boost += 0.03;
  }

  if (isTableOfContentsChunk(chunk.content)) {
    boost -= 0.08;
  }

  return boost;
}

function pickDiverseTopChunks(
  scored: Array<RetrievedChunk & { finalScore: number }>,
  topK: number,
): RetrievedChunk[] {
  const groups = new Map<string, Array<RetrievedChunk & { finalScore: number }>>();

  for (const item of scored) {
    const group = groups.get(item.documentId) ?? [];
    group.push(item);
    groups.set(item.documentId, group);
  }

  const buckets = [...groups.values()].map((group) =>
    group.sort((left, right) => right.finalScore - left.finalScore),
  );
  buckets.sort((left, right) => (right[0]?.finalScore ?? 0) - (left[0]?.finalScore ?? 0));

  const selected: RetrievedChunk[] = [];
  const usedChunkIds = new Set<string>();

  while (selected.length < topK) {
    let pickedInRound = false;

    for (const bucket of buckets) {
      const candidate = bucket.shift();
      if (!candidate || usedChunkIds.has(candidate.chunkId)) {
        continue;
      }

      const { finalScore: _finalScore, ...chunk } = candidate;
      selected.push(chunk);
      usedChunkIds.add(candidate.chunkId);
      pickedInRound = true;

      if (selected.length >= topK) {
        break;
      }
    }

    if (!pickedInRound) {
      break;
    }
  }

  return selected;
}

function rerankRetrievedChunks(
  chunks: RetrievedChunk[],
  analysis: RetrievalQueryAnalysis,
  topK: number,
): RetrievedChunk[] {
  const scored = chunks
    .map((chunk) => ({
      ...chunk,
      finalScore: Math.max(0, chunk.score * 0.68 + computeCoverageBoost(chunk, analysis)),
    }))
    .sort((left, right) => right.finalScore - left.finalScore);

  if (!analysis.prefersDocumentDiversity) {
    return scored.slice(0, topK).map(({ finalScore: _finalScore, ...chunk }) => chunk);
  }

  const diverse = pickDiverseTopChunks(scored, topK);
  if (diverse.length >= topK || diverse.length === scored.length) {
    return diverse.slice(0, topK);
  }

  const selectedIds = new Set(diverse.map((chunk) => chunk.chunkId));
  const fallback = scored
    .filter((chunk) => !selectedIds.has(chunk.chunkId))
    .slice(0, topK - diverse.length)
    .map(({ finalScore: _finalScore, ...chunk }) => chunk);

  return [...diverse, ...fallback].slice(0, topK);
}

export async function retrieveProjectContext(params: {
  projectId: string;
  query: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const topK = params.topK ?? 6;

  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project) {
    throw new Error("Project not found");
  }

  const normalizedQuery = params.query.trim();
  const analysis = analyzeRetrievalQuery(normalizedQuery);
  if (analysis.isPersonList) {
    return getPersonLexicalMatches({
      projectId: project.id,
      topK,
    });
  }

  const lexicalMatches = await getLexicalMatches({
    projectId: project.id,
    query: normalizedQuery,
    topK: Math.max(topK * (analysis.requiresBroadCoverage ? 5 : 4), topK),
  });

  if (!hasOpenAIEmbeddingsConfigured()) {
    return rerankRetrievedChunks(lexicalMatches, analysis, topK);
  }

  const [queryEmbedding] = await embedTexts([params.query]);
  const vectorMatches = await getVectorAdapter().query({
    namespace: project.vectorNamespace,
    queryEmbedding,
    topK: Math.max(topK * (analysis.requiresBroadCoverage ? 4 : 3), topK),
  });

  const chunkIds = vectorMatches
    .map((match) => String(match.metadata.chunkId ?? ""))
    .filter((value) => value.length > 0);

  if (chunkIds.length === 0) {
    return rerankRetrievedChunks(lexicalMatches, analysis, topK);
  }

  const chunks = await prisma.documentChunk.findMany({
    where: { id: { in: chunkIds } },
    include: {
      document: {
        select: {
          id: true,
          fileName: true,
        },
      },
    },
  });

  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  const vectorRetrieved = vectorMatches
    .map((match) => {
      const chunkId = String(match.metadata.chunkId ?? "");
      const chunk = chunkById.get(chunkId);
      if (!chunk) {
        return null;
      }

      return {
        chunkId: chunk.id,
        documentId: chunk.document.id,
        documentName: chunk.document.fileName,
        content: cleanDocumentTextForReading(chunk.content),
        score: Math.max(0, Math.min(1, match.score)),
        pageNumber: chunk.pageNumber,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      } satisfies RetrievedChunk;
    })
    .filter((item): item is RetrievedChunk => Boolean(item));

  const merged = new Map<string, RetrievedChunk>();

  lexicalMatches.forEach((chunk) => {
    merged.set(chunk.chunkId, chunk);
  });

  vectorRetrieved.forEach((chunk) => {
    const existing = merged.get(chunk.chunkId);
    if (!existing) {
      merged.set(chunk.chunkId, chunk);
      return;
    }

    merged.set(chunk.chunkId, {
      ...chunk,
      score: Math.max(chunk.score * 0.72 + existing.score * 0.28, existing.score),
    });
  });

  return rerankRetrievedChunks([...merged.values()], analysis, topK);
}
