const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "with",
  "ช่วย",
  "ขอ",
  "คือ",
  "ครับ",
  "ค่ะ",
  "คะ",
  "ของ",
  "จาก",
  "ที่",
  "นี้",
  "นั้น",
  "ใน",
  "และ",
  "หรือ",
  "ให้",
  "ได้",
  "ไหม",
  "หน่อย",
  "ทั้งหมด",
  "ฉบับนี้",
  "เอกสาร",
  "ในเอกสาร",
  "ปรากฏ",
]);
const THAI_QUERY_KEYWORDS = [
  "ชื่อบริษัท",
  "บริษัท",
  "ผู้เขียน",
  "ชื่อ-สกุล",
  "ชื่อสกุล",
  "นามสกุล",
  "ชื่อ",
  "อาจารย์ที่ปรึกษา",
  "พนักงานที่ปรึกษา",
  "กรรมการสอบ",
  "ประธานกรรมการสอบ",
  "ระยะเวลา",
  "ปฏิบัติงาน",
  "วัตถุประสงค์",
  "ผลที่คาดว่าจะได้รับ",
  "เทคโนโลยี",
  "โมเดล",
  "ภาษาไทย",
  "สรุป",
  "pairwise",
  "judge",
  "correctness",
  "relevance",
  "naturalness",
  "completeness",
  "faithfulness",
  "instruction following",
  "bleu",
  "rouge",
  "accuracy",
  "precision",
  "recall",
  "คะแนน",
  "ผลประเมิน",
  "ประสิทธิภาพ",
];

export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSearchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return [];
  }

  const rawMetricTerms =
    query.match(
      /\b(?:bleu(?:[-_ ]?\d)?|rouge(?:[-_ ]?[a-z0-9]+)?|f1|accuracy|precision|recall|pairwise|judge|correctness|relevance|naturalness|completeness|faithfulness|benchmark|latency|throughput)\b/giu,
    ) ?? [];

  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token));

  const phrases: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if ((first?.length ?? 0) >= 2 && (second?.length ?? 0) >= 2) {
      phrases.push(`${first} ${second}`);
    }
  }

  const keywordMatches = THAI_QUERY_KEYWORDS.filter((keyword) => normalized.includes(keyword));

  return [...new Set([...rawMetricTerms, ...keywordMatches, ...phrases.slice(0, 6), ...tokens.slice(0, 10)])];
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) {
    return 0;
  }

  let count = 0;
  let fromIndex = 0;

  while (fromIndex < haystack.length) {
    const matchIndex = haystack.indexOf(needle, fromIndex);
    if (matchIndex < 0) {
      break;
    }

    count += 1;
    fromIndex = matchIndex + Math.max(needle.length, 1);
  }

  return count;
}

function trimSnippetEdges(snippet: string, hasLeadingTrim: boolean, hasTrailingTrim: boolean): string {
  let nextSnippet = snippet.trim();

  if (hasLeadingTrim) {
    const firstBoundary = nextSnippet.indexOf(" ");
    if (firstBoundary >= 24) {
      nextSnippet = nextSnippet.slice(firstBoundary + 1).trimStart();
    }
  }

  if (hasTrailingTrim) {
    const lastBoundary = nextSnippet.lastIndexOf(" ");
    if (lastBoundary >= 24) {
      nextSnippet = nextSnippet.slice(0, lastBoundary).trimEnd();
    }
  }

  return nextSnippet;
}

export function buildSnippetAroundQuery(content: string, query: string, maxLength = 320): string {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) {
    return "";
  }

  if (normalizedContent.length <= maxLength) {
    return normalizedContent;
  }

  const searchTerms = extractSearchTerms(query).sort((left, right) => right.length - left.length);
  const loweredContent = normalizedContent.toLowerCase();

  let anchorIndex = -1;
  for (const term of searchTerms) {
    const matchIndex = loweredContent.indexOf(term.toLowerCase());
    if (matchIndex >= 0) {
      anchorIndex = matchIndex;
      break;
    }
  }

  if (anchorIndex < 0) {
    return `${normalizedContent.slice(0, maxLength).trimEnd()}...`;
  }

  const start = Math.max(0, anchorIndex - Math.floor(maxLength * 0.34));
  const end = Math.min(normalizedContent.length, start + maxLength);
  const trimmed = trimSnippetEdges(normalizedContent.slice(start, end), start > 0, end < normalizedContent.length);

  return `${start > 0 ? "..." : ""}${trimmed}${end < normalizedContent.length ? "..." : ""}`;
}
