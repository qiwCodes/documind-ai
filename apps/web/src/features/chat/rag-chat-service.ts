import { generateText } from "ai";
import { prisma } from "@/lib/db/client";
import type { CitationRef } from "@/types/workspace";
import { getChatModel, hasChatLlmConfigured } from "@/lib/ai/chat-model";
import { retrieveProjectContext } from "@/features/retrieval/retrieve-context";
import { buildSnippetAroundQuery } from "@/lib/rag/query-utils";
import { cleanDocumentTextForReading } from "@/lib/text/document-cleanup";

type ChatTurn = { role: "user" | "assistant"; content: string };
type ParsedTableSegment = { key: string; value: string };
type ParsedTableRow = { label: string; segments: ParsedTableSegment[] };

export type RagChatResult = {
  answer: string;
  citations: CitationRef[];
};

const quickActionLead: Record<string, string> = {
  summarize: "เน้นสรุปสาระสำคัญจากทุกแหล่งข้อมูลอย่างกระชับ",
  contradictions: "เน้นชี้จุดข้อมูลที่ขัดแย้งหรือไม่สอดคล้องกันระหว่างแหล่งข้อมูล",
  study_guide: "จัดทำสรุปสำหรับทบทวนที่มีหัวข้อสำคัญและคำถามฝึกคิด",
};
const TOC_PATTERN = /สารบัญ|สารบัญภาพ|สารบัญตาราง/u;
const PERSON_TITLE_PATTERN =
  /(?:^|[^\p{L}\p{N}\p{M}])((?:นาย|นางสาว|นาง|อาจารย์(?:\s+ดร\.?)?|ดร\.?)\s*[\p{L}\p{M}]{2,}(?:\s+[\p{L}\p{M}]{2,}){0,4})(?=$|[^\p{L}\p{N}\p{M}])/gu;

function isCoverageSensitiveQuery(message: string): boolean {
  const text = message.toLowerCase();
  return /รายชื่อ|บุคคล|กี่คน|ทั้งหมดกี่|ใครบ้าง|list|name|people|person|count|ทั้งหมด|ทุกคน|all\b/.test(
    text,
  );
}

function isPersonListQuery(message: string): boolean {
  const text = message.toLowerCase();
  return /รายชื่อบุคคล|บุคคลทั้งหมด|ใครบ้าง|รายชื่อคน|people|person|name list|ชื่อ\s*(?:และ)?\s*(?:สกุล|นามสกุล)|ชื่อ-สกุล|full names?/.test(
    text,
  );
}

function isComparisonQuery(message: string): boolean {
  return /เปรียบเทียบ|compare|ต่างกัน|difference|versus|เทียบ/.test(message.toLowerCase());
}

function isMetricTableQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  const mentionsMetric =
    /bleu|rouge|accuracy|precision|recall|f1|auc|mae|mse|rmse|wer|cer|loss|score|metric|benchmark|latency|throughput|pairwise|judge|win\s*rate|evaluation|eval|correctness|relevance|naturalness|completeness|faithfulness|instruction following/.test(
      normalized,
    ) ||
    /คะแนน|เมตริก|ตัวชี้วัด|ผลการทดลอง|ผลลัพธ์|benchmark|performance|ประสิทธิภาพ|pairwise|รายมิติ|ผลประเมิน|ประเมิน|ตัดสิน|ชนะ|เสมอ|แพ้/.test(
      normalized,
    );

  if (!mentionsMetric) {
    return false;
  }

  return (
    /อะไรบ้าง|เท่าไรบ้าง|เท่าไหร่บ้าง|แต่ละ|แยก|ทั้งหมด|list|show|compare|เปรียบเทียบ|เทียบ|ตาราง|table|pairwise|judge|รายมิติ|criterion|criteria/.test(
      normalized,
    ) || /(bleu|rouge|f1|precision|recall|accuracy)[-_ ]?\d/.test(normalized)
  );
}

function isStepwiseQuery(message: string): boolean {
  return /ขั้นตอน|วิธี|process|workflow|how to|อย่างไร/.test(message.toLowerCase());
}

function isDirectFactQuery(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.length <= 120 &&
    /คืออะไร|คือใคร|ชื่ออะไร|ชื่อใคร|บริษัทอะไร|บริษัทไหน|ใครเป็น|เท่าไร|กี่|อะไรบ้าง/.test(
      normalized,
    )
  );
}

function isContextDependentFollowUpQuery(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  if (normalized.length > 90) {
    return false;
  }

  return /^(แล้ว|งั้น|ทีนี้|ต่อไป|เพิ่มเติม|ขยาย|สรุป|ขอดู|ดู|เทียบ|เปรียบเทียบ|ส่วน|ตัว|อันนี้|อันนั้น|อันข้างบน|base|fine[- ]?tuned|pairwise|judge|metric|score|ตาราง|อธิบายเพิ่ม)/.test(
    normalized,
  );
}

function sanitizeHistoryMessage(content: string): string {
  return content.replace(/\[\d+\]/g, " ").replace(/\s+/g, " ").trim();
}

function buildRetrievalQuery(message: string, history: ChatTurn[]): string {
  const trimmed = message.trim();
  if (!isContextDependentFollowUpQuery(trimmed)) {
    return trimmed;
  }

  const priorUserTurns = history
    .filter((turn) => turn.role === "user")
    .map((turn) => sanitizeHistoryMessage(turn.content))
    .filter(Boolean)
    .slice(-2);

  if (priorUserTurns.length === 0) {
    return trimmed;
  }

  return `${priorUserTurns.join("\n")}\nคำถามต่อเนื่อง: ${trimmed}`;
}

function buildResponseFormatGuide(message: string): string {
  if (isMetricTableQuery(message)) {
    return "รูปแบบคำตอบ: ถ้าเป็นค่าหลาย metric, score, benchmark, pairwise evaluation หรือผลลัพธ์หลายชุด ให้ตอบเป็นตาราง Markdown ทันที โดยใช้คอลัมน์ที่อ่านง่าย เช่น Metric | Value, Metric | ชุด A | ชุด B, หรือ Criterion | Base | Fine-tuned | Tie แล้วค่อยสรุปสั้นใต้ตาราง";
  }

  if (isComparisonQuery(message)) {
    return "รูปแบบคำตอบ: ถ้าข้อมูลเทียบกันเป็นคอลัมน์ได้ชัด ให้ใช้ตาราง Markdown สั้น ๆ และตามด้วย bullet สรุปประเด็นสำคัญ";
  }

  if (isDirectFactQuery(message)) {
    return "รูปแบบคำตอบ: ตอบตรงประเด็นใน 1-2 ประโยคก่อน และแตกเป็นรายการเฉพาะเมื่อคำถามขอหลายข้อจริง ๆ";
  }

  if (isStepwiseQuery(message)) {
    return "รูปแบบคำตอบ: ใช้ numbered list สำหรับขั้นตอนหลัก และมีสรุปสั้นก่อนเข้ารายละเอียด";
  }

  if (isPersonListQuery(message) || /มีอะไรบ้าง|list|รายการ|หัวข้อ|bullet/.test(message.toLowerCase())) {
    return "รูปแบบคำตอบ: ใช้ bullet list หรือ numbered list เมื่อเป็นรายการหลายข้อ และใส่คำอธิบายสั้นต่อข้อเท่าที่จำเป็น";
  }

  return "รูปแบบคำตอบ: ตอบเป็นย่อหน้าสั้น 1-3 ย่อหน้า และแตก bullet เฉพาะเมื่อช่วยให้อ่านง่ายขึ้น";
}

function buildAnalysisGuide(message: string): string {
  if (isMetricTableQuery(message) || isComparisonQuery(message)) {
    return "แนวคิดการวิเคราะห์: ตรวจ evidence ให้ครบทุกมิติที่ถามก่อนสรุป เปรียบเทียบจากข้อมูลจริงใน Context เท่านั้น และถ้าบางมิติไม่มีหลักฐานให้บอกว่าข้อมูลยังไม่พอแทนการเดา";
  }

  if (isCoverageSensitiveQuery(message)) {
    return "แนวคิดการวิเคราะห์: ตรวจหลาย context snippet ก่อนสรุป เพื่อไม่พลาดรายการสำคัญหรือสรุปจากหลักฐานเพียงจุดเดียว";
  }

  if (isStepwiseQuery(message)) {
    return "แนวคิดการวิเคราะห์: เรียงขั้นตอนตามลำดับที่ Context รองรับจริง และอย่าเติมขั้นตอนที่ไม่มีหลักฐาน";
  }

  return "แนวคิดการวิเคราะห์: ระบุ intent ของคำถามให้ถูกก่อน แล้วเลือกเฉพาะหลักฐานที่ตอบคำถามนั้นโดยตรง";
}

function normalizeTableColumnKey(rawKey: string): string {
  return rawKey
    .replace(/\s+(ดีกว่า|ชนะ|better|wins?)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRepeatingFieldSegment(segment: string): ParsedTableSegment | null {
  const trimmed = segment.trim();
  if (!trimmed) {
    return null;
  }

  const numericPattern =
    /^(.+?)\s+((?:ประมาณ|ราว|เฉลี่ย)?\s*-?\d+(?:\.\d+)?(?:\s*(?:%|คะแนน|ครั้ง|วัน|เดือน|ปี|ms|s))?)((?:\s*\[\d+\])*)$/u;
  const numericMatch = trimmed.match(numericPattern);

  if (numericMatch) {
    const [, rawKey, rawValue, rawCitation] = numericMatch;
    return {
      key: normalizeTableColumnKey(rawKey ?? ""),
      value: `${rawValue ?? ""}${rawCitation ?? ""}`.trim(),
    };
  }

  const fallbackPattern = /^(.+?)\s+([^\s].*?)((?:\s*\[\d+\])*)$/u;
  const fallbackMatch = trimmed.match(fallbackPattern);
  if (!fallbackMatch) {
    return null;
  }

  const [, rawKey, rawValue, rawCitation] = fallbackMatch;
  const key = normalizeTableColumnKey(rawKey ?? "");
  const value = `${rawValue ?? ""}${rawCitation ?? ""}`.trim();

  if (!key || !value || value.length > 28) {
    return null;
  }

  return { key, value };
}

function parseRepeatingFieldRow(line: string): ParsedTableRow | null {
  const rowMatch = line.match(/^\s*(?:[-*•]|\d+\.)\s+([^:：\n]{1,80})[:：]\s+(.+)\s*$/u);
  if (!rowMatch) {
    return null;
  }

  const [, rawLabel, rawDetail] = rowMatch;
  const segments = rawDetail
    .split(/\s*,\s*/u)
    .map(parseRepeatingFieldSegment)
    .filter((segment): segment is ParsedTableSegment => Boolean(segment));

  if (segments.length < 2) {
    return null;
  }

  return {
    label: rawLabel.trim(),
    segments,
  };
}

function buildTableFromRepeatingFieldRows(rows: ParsedTableRow[]): string | null {
  if (rows.length < 2) {
    return null;
  }

  const firstRowKeys = rows[0]?.segments.map((segment) => segment.key);
  if (!firstRowKeys || firstRowKeys.length < 2) {
    return null;
  }

  const hasConsistentSchema = rows.every((row) => {
    if (row.segments.length !== firstRowKeys.length) {
      return false;
    }

    return row.segments.every((segment, index) => {
      const expectedKey = firstRowKeys[index];
      return segment.key.toLowerCase() === expectedKey?.toLowerCase();
    });
  });

  if (!hasConsistentSchema) {
    return null;
  }

  const header = `| รายการ | ${firstRowKeys.join(" | ")} |`;
  const separator = `| --- | ${firstRowKeys.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.label} | ${row.segments.map((segment) => segment.value).join(" | ")} |`);

  return [header, separator, ...body].join("\n");
}

function convertRepeatingFieldListsToTables(answer: string): string {
  const lines = answer.split("\n");
  const converted: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const candidateRows: ParsedTableRow[] = [];
    let nextIndex = index;

    while (nextIndex < lines.length) {
      const parsedRow = parseRepeatingFieldRow(lines[nextIndex] ?? "");
      if (!parsedRow) {
        break;
      }

      candidateRows.push(parsedRow);
      nextIndex += 1;
    }

    const table = buildTableFromRepeatingFieldRows(candidateRows);
    if (table) {
      if (converted.length > 0 && converted[converted.length - 1]?.trim()) {
        converted.push("");
      }

      converted.push(table);

      if (nextIndex < lines.length && lines[nextIndex]?.trim()) {
        converted.push("");
      }

      index = nextIndex;
      continue;
    }

    converted.push(lines[index] ?? "");
    index += 1;
  }

  return converted.join("\n");
}

function normalizePersonName(name: string): string {
  return cleanDocumentTextForReading(name)
    .replace(/[()]/g, " ")
    .replace(
      /^(ผู้เขียน|ผู้จัดทำ|อาจารย์ที่ปรึกษา|พนักงานที่ปรึกษา|ชื่อ-สกุล|ชื่อสกุล|กรรมการสอบ)\s*/u,
      "",
    )
    .replace(/(นาย|นางสาว|นาง|ดร\.|อาจารย์)(?=[ก-๙A-Za-z])/gu, "$1 ")
    .replace(
      /(คณะวิชา|สาขาวิชา|แผนก|ตำแหน่ง|ชื่อบริษัท|วัน\s*เดือน\s*ปีเกิด|วันเดือนปีเกิด|ประวัติการศึกษา|โครงงาน).*$/u,
      "",
    )
    .replace(/อาจารย์\s+ดร(?=\s|[ก-๙A-Za-z])/gu, "อาจารย์ ดร.")
    .replace(/\s+/g, " ")
    .trim();
}

function personNameDedupKey(name: string): string {
  return normalizePersonName(name)
    .toLowerCase()
    .replace(/ดร\./g, "ดร")
    .replace(/[.\-'\s]/g, "");
}

function extractStructuredPersonNames(rawText: string, readableText: string): string[] {
  const matches = new Set<string>();

  const addMatch = (value: string | undefined) => {
    if (!value) {
      return;
    }

    const normalized = normalizePersonName(value);
    if (!normalized) {
      return;
    }

    if (
      normalized.length < 4 ||
      /(คณะ|สาขา|บริษัท|เทคโนโลยี|โครงงาน|ปัญญา|สารสนเทศ|วันเดือนปีเกิด|แผนก|ตำแหน่ง)/u.test(
        normalized,
      )
    ) {
      return;
    }

    matches.add(normalized);
  };

  for (const match of readableText.matchAll(/กรรมการสอบ\s*\(([^)]+)\)/gu)) {
    addMatch(match[1]);
  }

  for (const match of readableText.matchAll(/ประธานกรรมการสอบ\s*\(([^)]+)\)/gu)) {
    addMatch(match[1]);
  }

  for (const match of readableText.matchAll(/ประธานสหกิจศึกษา\s*สาขาวิชา\s*\(([^)]+)\)/gu)) {
    addMatch(match[1]);
  }

  for (const match of readableText.matchAll(/อาจารย์ที่ปรึกษา\s*\(([^)]+)\)/gu)) {
    addMatch(match[1]);
  }

  for (const match of readableText.matchAll(/ผู้เขียน\s+(.+?)(?=\s+(?:คณะวิชา|สาขาวิชา|อาจารย์ที่ปรึกษา|พนักงานที่ปรึกษา|ชื่อบริษัท|$))/gu)) {
    addMatch(match[1]);
  }

  for (const match of readableText.matchAll(/พนักงานที่ปรึกษา(?:ชื่อ:)?\s+(.+?)(?=\s+(?:แผนก|ตำแหน่ง|ชื่อบริษัท|วันเดือนปีเกิด|$))/gu)) {
    addMatch(match[1]);
  }

  for (const match of readableText.matchAll(/ชื่อ-สกุล\s+(.+?)(?=\s*(?:วัน\s*เดือน\s*ปีเกิด|วันเดือนปีเกิด|ประวัติการศึกษา|$))/gu)) {
    addMatch(match[1]);
  }

  for (const match of readableText.matchAll(/(.+?)\s+ผู้จัดทำ(?=\s|$)/gu)) {
    addMatch(match[1]);
  }

  for (const match of rawText.matchAll(/(นาย\s+[ก-๙]{2,}(?:\s+[ก-๙]{2,}){1,3})(?=\s+โครงงาน)/gu)) {
    addMatch(match[1]);
  }

  for (const match of rawText.matchAll(/(อาจารย์(?:\s+ดร\.)?\s+[ก-๙]{2,}(?:\s+[ก-๙]{2,}){1,3})/gu)) {
    addMatch(match[1]);
  }

  return [...matches];
}

function scoreDisplayNameQuality(name: string): number {
  let score = name.length;

  if (/(วันเดือนปีเกิด|ประวัติการศึกษา|คณะวิชา|สาขาวิชา|ตำแหน่ง|ชื่อบริษัท|\d)/u.test(name)) {
    score -= 40;
  }

  if (/(นาย|นางสาว|นาง|อาจารย์|ดร\.)\s+/u.test(name)) {
    score += 12;
  }

  score += Math.min(name.split(" ").filter(Boolean).length, 4) * 3;

  if (!/\s/u.test(name) && name.length >= 12) {
    score -= 10;
  }

  if (/^(นาย|นางสาว|นาง|อาจารย์|ดร\.)[ก-๙A-Za-z]{6,}/u.test(name)) {
    score -= 8;
  }

  return score;
}

function sanitizeSnippetText(text: string): string {
  return text.replace(/\.{4,}/g, " … ").replace(/\s+/g, " ").trim();
}

function buildPersonCitationQuote(content: string): string {
  const normalized = sanitizeSnippetText(content);
  if (!normalized) {
    return "";
  }

  const anchors = [
    "ผู้เขียน",
    "ประธานกรรมการสอบ",
    "กรรมการสอบ",
    "อาจารย์ที่ปรึกษา",
    "พนักงานที่ปรึกษา",
    "ชื่อ-สกุล",
    "ผู้จัดทำ",
  ];

  const anchorIndex = anchors
    .map((anchor) => normalized.indexOf(anchor))
    .find((index) => index >= 0);

  if (anchorIndex === undefined || anchorIndex < 0) {
    return buildSnippetAroundQuery(normalized, "ผู้เขียน ชื่อ-สกุล อาจารย์ที่ปรึกษา พนักงานที่ปรึกษา", 280);
  }

  const start = Math.max(0, anchorIndex - 20);
  const end = Math.min(normalized.length, start + 280);
  const snippet = normalized.slice(start, end).trim();
  return `${start > 0 ? "..." : ""}${snippet}${end < normalized.length ? "..." : ""}`;
}

async function buildPersonQueryAnswer(params: {
  projectId: string;
  message: string;
}): Promise<RagChatResult | null> {
  const chunks = await prisma.documentChunk.findMany({
    where: { projectId: params.projectId },
    include: {
      document: {
        select: {
          id: true,
          fileName: true,
        },
      },
    },
    orderBy: [{ pageNumber: "asc" }, { chunkIndex: "asc" }],
    take: 2500,
  });

  const candidates = chunks
    .map((chunk) => {
      const readable = cleanDocumentTextForReading(chunk.content);
      if (!readable || TOC_PATTERN.test(readable)) {
        return null;
      }

      const extractedNames = extractStructuredPersonNames(chunk.content, readable);
      if (extractedNames.length === 0) {
        return null;
      }

      const compact = readable.replace(/[^\p{L}\p{N}]+/gu, "");
      const hasPersonField =
        /ผู้เขียน(?=นาย|นางสาว|นาง|อาจารย์|ดร|[ก-๙])|ผู้จัดทำโครงงาน|อาจารย์ที่ปรึกษา(?=นาย|นางสาว|นาง|อาจารย์|ดร)|พนักงานที่ปรึกษา(?=ชื่อ|นาย|นางสาว|นาง|อาจารย์|ดร)|ชื่อสกุล(?=นาย|นางสาว|นาง|อาจารย์|ดร)|กรรมการสอบ(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประธานกรรมการสอบ(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประธานสหกิจศึกษาสาขาวิชา(?=อาจารย์|นาย|นางสาว|นาง|ดร)|ประวัติผู้จัดทำโครงงาน/u.test(
          compact,
        );
      const pageBoost = (chunk.pageNumber ?? 999) <= 5 || (chunk.pageNumber ?? 0) >= 80 ? 6 : 0;
      const titleMatchCount = [...readable.matchAll(PERSON_TITLE_PATTERN)].length;
      const score =
        extractedNames.length * 10 + (hasPersonField ? 12 : 0) + Math.min(titleMatchCount, 4) * 2 + pageBoost;

      return {
        chunk,
        readable,
        names: extractedNames,
        score,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => right.score - left.score || (left.chunk.pageNumber ?? 0) - (right.chunk.pageNumber ?? 0))
    .slice(0, 6);

  if (candidates.length === 0) {
    return null;
  }

  const allUniqueNameKeys = new Set(
    candidates.flatMap(({ names }) => names.map((name) => personNameDedupKey(name)).filter(Boolean)),
  );
  const coveredNameKeys = new Set<string>();
  const selectedCandidates = candidates.filter((candidate, index) => {
    const candidateKeys = candidate.names
      .map((name) => personNameDedupKey(name))
      .filter((value): value is string => Boolean(value));
    const addsNewName = candidateKeys.some((key) => !coveredNameKeys.has(key));

    if (!addsNewName && index > 0) {
      return false;
    }

    candidateKeys.forEach((key) => coveredNameKeys.add(key));
    return true;
  });

  const effectiveCandidates =
    coveredNameKeys.size === allUniqueNameKeys.size ? selectedCandidates : candidates;

  const citations = effectiveCandidates.map(({ chunk, readable }, index) =>
    ({
      id: index + 1,
      documentId: chunk.document.id,
      documentName: chunk.document.fileName,
      chunkId: chunk.id,
      quote: buildPersonCitationQuote(readable),
      score: chunk.pageNumber && chunk.pageNumber <= 5 ? 0.98 : 0.92,
      pageNumber: chunk.pageNumber,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
    }) satisfies CitationRef,
  );

  const nameMap = new Map<string, { name: string; refs: Set<number>; quality: number }>();

  effectiveCandidates.forEach(({ names }, index) => {
    names.forEach((name) => {
      const key = personNameDedupKey(name);
      if (!key) {
        return;
      }

      const normalizedName = normalizePersonName(name);
      const quality = scoreDisplayNameQuality(normalizedName);
      if (quality <= 0) {
        return;
      }

      const existing = nameMap.get(key);
      if (!existing) {
        nameMap.set(key, {
          name: normalizedName,
          refs: new Set([index + 1]),
          quality,
        });
        return;
      }

      existing.refs.add(index + 1);
      if (quality > existing.quality) {
        existing.name = normalizedName;
        existing.quality = quality;
      }
    });
  });

  const dedupedNames = [...nameMap.values()]
    .map((item) => ({
      name: item.name,
      refs: [...item.refs].sort((left, right) => left - right),
      firstRef: Math.min(...item.refs),
    }))
    .sort((left, right) => left.firstRef - right.firstRef || left.name.localeCompare(right.name, "th"));

  if (dedupedNames.length === 0) {
    return null;
  }

  const answerLines = [
    `เท่าที่พบในเอกสาร มีชื่อบุคคลที่ระบุชัดเจน ${dedupedNames.length} คน`,
    "",
    ...dedupedNames.map(
      (item, index) => `${index + 1}. ${item.name} ${item.refs.map((ref) => `[${ref}]`).join(" ")}`,
    ),
  ];

  return {
    answer: answerLines.join("\n"),
    citations,
  };
}

function buildCitation(chunk: {
  documentId: string;
  documentName: string;
  chunkId: string;
  content: string;
  score: number;
  pageNumber: number | null;
  startOffset: number | null;
  endOffset: number | null;
}, index: number, query: string): CitationRef {
  const sanitizedContent = sanitizeSnippetText(chunk.content);

  return {
    id: index + 1,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    chunkId: chunk.chunkId,
    quote: buildSnippetAroundQuery(sanitizedContent, query, 320),
    score: chunk.score,
    pageNumber: chunk.pageNumber,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
  };
}

function buildFallbackAnswer(query: string, citations: CitationRef[], action?: string): string {
  if (citations.length === 0) {
    return "ยังไม่พบข้อมูลในเอกสารที่พอจะตอบได้อย่างมั่นใจ กรุณาอัปโหลดเอกสารเพิ่มหรือถามให้เจาะจงขึ้น";
  }

  const intro = action ? `โหมด: ${action}` : "สรุปคำตอบจากเอกสาร";
  const keyPoints = citations
    .slice(0, 3)
    .map((citation) => `- ${citation.quote} [${citation.id}]`)
    .join("\n");

  return [
    intro,
    "",
    keyPoints,
    "",
    "หมายเหตุ: ตอนนี้ระบบกำลังใช้โหมดสรุปพื้นฐาน (fallback) หากต้องการคำตอบเชิงสนทนาที่ฉลาดและยืดหยุ่นกว่านี้ ให้ตั้งค่า `GROQ_API_KEY` หรือ `OPENAI_API_KEY`",
  ].join("\n");
}

export async function generateRagAnswer(params: {
  projectId: string;
  message: string;
  history: ChatTurn[];
  action?: string;
}): Promise<RagChatResult> {
  const retrievalQuery = buildRetrievalQuery(params.message, params.history);

  if (isPersonListQuery(params.message)) {
    const personAnswer = await buildPersonQueryAnswer({
      projectId: params.projectId,
      message: params.message,
    });

    if (personAnswer) {
      return personAnswer;
    }
  }

  const topK = isPersonListQuery(params.message)
    ? 10
    : isMetricTableQuery(params.message) || isComparisonQuery(params.message) || isContextDependentFollowUpQuery(params.message)
      ? 10
    : isCoverageSensitiveQuery(params.message)
      ? 12
      : isDirectFactQuery(params.message)
        ? 5
        : 8;
  const retrieved = await retrieveProjectContext({
    projectId: params.projectId,
    query: retrievalQuery,
    topK,
  });

  const citations: CitationRef[] = retrieved.map((chunk, index) => buildCitation(chunk, index, params.message));

  if (!hasChatLlmConfigured() || citations.length === 0) {
    return {
      answer: buildFallbackAnswer(params.message, citations, params.action),
      citations,
    };
  }

  const contextBlock = citations
    .map((citation, index) => {
      const rawChunk = retrieved[index];
      return `[${citation.id}] ${citation.documentName}${citation.pageNumber ? ` · page ${citation.pageNumber}` : ""}\n${rawChunk?.content ?? citation.quote}`;
    })
    .join("\n\n");

  const conversationBlock = params.history
    .slice(-6)
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join("\n");

  const { text } = await generateText({
    model: getChatModel(),
    temperature: 0.1,
    prompt: [
      "คุณคือผู้ช่วย RAG ที่ต้องอ้างอิงแหล่งข้อมูลอย่างเคร่งครัด",
      quickActionLead[params.action ?? ""] ?? "",
      "ให้ตอบเป็นภาษาไทยเสมอ (ยกเว้นชื่อเฉพาะหรือศัพท์เทคนิคที่ควรคงเป็นภาษาอังกฤษ)",
      "ตอบให้ตรงคำถามทันที ห้ามทวนคำถามผู้ใช้ซ้ำ และห้ามขึ้นต้นด้วยคำว่า 'คำถาม:'",
      "ให้สรุปและเรียบเรียงใหม่ในสไตล์ chatbot ที่เป็นธรรมชาติ อ่านง่าย และไม่แข็ง",
      buildAnalysisGuide(params.message),
      "ถ้าเป็นคำถามข้อเท็จจริงสั้น ๆ ให้ตอบสั้นและตรงก่อน แล้วหยุดเมื่อคำตอบครบ ไม่ต้องขยายความเกินคำถาม",
      buildResponseFormatGuide(params.message),
      "เลือกรูปแบบคำตอบให้เหมาะกับสาระ: ย่อหน้าสั้นสำหรับคำตอบตรง ๆ, bullet list สำหรับรายการหลายข้อ, numbered list สำหรับขั้นตอน, และตาราง Markdown เมื่อข้อมูลเป็นค่าหลายตัว หลายชุด ผลประเมินรายมิติ หรือเปรียบเทียบกันเป็นคอลัมน์ได้จริง",
      "ถ้าคำตอบสั้นมาก ไม่ต้องฝืนทำเป็น list หรือตาราง",
      "ถ้าคำถามเป็น follow-up จากบทสนทนาก่อนหน้า ให้ใช้บทสนทนาเพื่อ resolve ว่าผู้ใช้กำลังอ้างถึงเรื่องไหน แต่ข้อเท็จจริงสุดท้ายต้องอ้างจาก Context เท่านั้น",
      "ถ้าคำถามเป็นแนวนับจำนวนหรือหารายชื่อ (เช่น กี่คน/ใครบ้าง) ให้ตรวจทุก context snippet ก่อนสรุปผล และตอบว่า 'เท่าที่พบในเอกสารที่ดึงมา' เพื่อไม่ฟันธงเกินข้อมูล",
      "ถ้าคำถามถามหารายชื่อบุคคล ให้ดึงเฉพาะชื่อคนที่ระบุชัดใน Context เท่านั้น ห้ามนับหัวข้อ ชื่อบท ตาราง รูปภาพ เทคโนโลยี บริษัท หรือคำทั่วไปเป็นชื่อบุคคล",
      "ถ้าชื่อเดียวกันปรากฏหลายครั้ง ให้รวมเป็นชื่อเดียวและถ้ามีบทบาทในเอกสารให้ระบุบทบาทสั้น ๆ เท่าที่ Context ยืนยันได้",
      "ก่อนสรุปเชิงเปรียบเทียบหรือเชิงวิเคราะห์ ให้ตรวจว่าหลักฐานครอบคลุมทุกฝั่งที่ถาม ถ้า Context รองรับไม่ครบ ให้ระบุขอบเขตความไม่แน่ใจอย่างชัดเจน",
      "ใช้เฉพาะข้อมูลใน Context ที่ให้มา และใส่ citation [n] ท้ายประโยค ท้าย bullet หรือใน cell ของตารางทุกครั้งที่มีข้อเท็จจริง",
      "ถ้าข้อมูลไม่พอ ให้ระบุให้ชัดว่าขาดข้อมูลส่วนไหน และหลีกเลี่ยงการเดาหรือแต่งเติม",
      "ห้ามคัดลอก Context ยาว ๆ ตรง ๆ เว้นแต่ผู้ใช้ขอ quote โดยตรง",
      conversationBlock ? `บทสนทนาก่อนหน้า:\n${conversationBlock}` : "",
      `คำถามผู้ใช้:\n${params.message}`,
      `Context:\n${contextBlock}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const normalizedAnswer = convertRepeatingFieldListsToTables(text.trim());

  return {
    answer: normalizedAnswer,
    citations,
  };
}
