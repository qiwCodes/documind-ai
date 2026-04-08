const SUPPORTED_TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
const SUPPORTED_APPLICATION_TYPES = new Set(["application/pdf"]);

const THAI_MARK_REGEX = /[\u0E31-\u0E3A\u0E47-\u0E4E]/;
import { cleanDocumentTextForReading } from "@/lib/text/document-cleanup";

export type ParsedPageSpan = {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
};

export type ParsedDocumentText = {
  text: string;
  pageSpans: ParsedPageSpan[];
};

function endsWithThaiMark(text: string): boolean {
  return THAI_MARK_REGEX.test(text.slice(-1));
}

function shouldJoinWithoutSpace(prev: string, next: string): boolean {
  if (!prev || !next) return true;
  if (endsWithThaiMark(prev)) return true;
  if (/^[,.;:!?)]/.test(next)) return true;
  if (/[(]$/.test(prev)) return true;
  return false;
}

function isThaiText(text: string): boolean {
  return /[ก-๙]/u.test(text);
}

function shouldJoinByGap(prev: string, next: string, gap: number): boolean {
  if (!prev || !next) {
    return true;
  }

  if (gap <= 0.45) {
    return true;
  }

  if (gap <= 1.5 && isThaiText(prev) && isThaiText(next)) {
    return true;
  }

  if (gap <= 1 && /[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(next)) {
    return true;
  }

  return false;
}

function normalizeThaiPdfArtifacts(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/\u200B/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    // Remove accidental spaces only between base Thai chars and Thai marks.
    .replace(/([ก-ฮ])\s+([่-๋็-๎])(?=[ก-๙]?)/g, "$1$2")
    // Collapse excessive blank lines from extracted PDF blocks.
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function buildParagraphs(lines: Array<{ text: string; y: number }>): string[] {
  if (lines.length === 0) {
    return [];
  }

  const gaps = lines
    .slice(1)
    .map((line, index) => Math.abs(lines[index]!.y - line.y))
    .filter((gap) => gap > 0.25)
    .sort((left, right) => left - right);

  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)]! : 0;
  const paragraphThreshold = medianGap > 0 ? medianGap * 1.65 : 18;

  const paragraphs: string[] = [];
  let paragraph = lines[0]!.text.trim();

  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1]!;
    const current = lines[index]!;
    const gap = Math.abs(previous.y - current.y);
    const shouldBreakParagraph = gap > paragraphThreshold;

    if (shouldBreakParagraph) {
      if (paragraph) {
        paragraphs.push(paragraph);
      }
      paragraph = current.text.trim();
      continue;
    }

    paragraph += shouldJoinWithoutSpace(paragraph, current.text) ? current.text : ` ${current.text}`;
  }

  if (paragraph) {
    paragraphs.push(paragraph);
  }

  return paragraphs;
}

function normalizeExtractedText(text: string): string {
  return cleanDocumentTextForReading(
    normalizeThaiPdfArtifacts(text)
    .replace(/([^\n])\n(?=[^\n])/g, "$1 ")
    .replace(/\n{3,}/g, "\n\n"),
  );
}

function finalizeParsedDocument(pages: string[]): ParsedDocumentText {
  let text = "";
  const pageSpans: ParsedPageSpan[] = [];

  pages.forEach((pageText, index) => {
    const normalizedPage = normalizeExtractedText(pageText);
    if (!normalizedPage) {
      return;
    }

    if (text) {
      text += "\n\n";
    }

    const startOffset = text.length;
    text += normalizedPage;

    pageSpans.push({
      pageNumber: index + 1,
      startOffset,
      endOffset: text.length,
    });
  });

  if (!text.trim()) {
    return { text: "", pageSpans: [] };
  }

  if (pageSpans.length === 0) {
    return {
      text,
      pageSpans: [{ pageNumber: 1, startOffset: 0, endOffset: text.length }],
    };
  }

  return { text, pageSpans };
}

async function extractTextFromPdf(buffer: Buffer): Promise<ParsedDocumentText> {
  const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = pdfParseModule.default ?? pdfParseModule;
  const pageTexts: string[] = [];
  let renderIndex = 0;

  await pdfParse(buffer, {
    pagerender: async (pageData: {
      getTextContent: (options: {
        normalizeWhitespace: boolean;
        disableCombineTextItems: boolean;
      }) => Promise<{ items: Array<{ str: string; transform: number[] }> }>;
    }) => {
      const pageIndex = renderIndex;
      renderIndex += 1;

      const textContent = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });

      let currentY: number | null = null;
      let currentXEnd: number | null = null;
      let lineBuffer = "";
      const lines: Array<{ text: string; y: number }> = [];

      for (const item of textContent.items) {
        const token = normalizeThaiPdfArtifacts(item.str || "");
        if (!token) continue;

        const y = item.transform?.[5] ?? 0;
        const x = item.transform?.[4] ?? 0;
        const width = Number((item as { width?: number }).width ?? 0);
        if (currentY === null || Math.abs(currentY - y) <= 0.5) {
          const gap = currentXEnd === null ? 0 : x - currentXEnd;
          const shouldJoin =
            shouldJoinWithoutSpace(lineBuffer, token) || shouldJoinByGap(lineBuffer, token, gap);

          lineBuffer += shouldJoin ? token : ` ${token}`;
          currentY = y;
          currentXEnd = x + width;
          continue;
        }

        if (lineBuffer.trim()) {
          lines.push({ text: lineBuffer.trim(), y: currentY ?? y });
        }
        lineBuffer = token;
        currentY = y;
        currentXEnd = x + width;
      }

      if (lineBuffer.trim()) {
        lines.push({ text: lineBuffer.trim(), y: currentY ?? 0 });
      }

      const pageText = buildParagraphs(lines).join("\n\n");
      pageTexts[pageIndex] = pageText;
      return pageText;
    },
  });

  return finalizeParsedDocument(pageTexts);
}

export function isSupportedDocumentType(mimeType: string): boolean {
  return SUPPORTED_TEXT_TYPES.has(mimeType) || SUPPORTED_APPLICATION_TYPES.has(mimeType);
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<ParsedDocumentText> {
  if (!isSupportedDocumentType(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType || "unknown"}`);
  }

  if (mimeType === "application/pdf") {
    return extractTextFromPdf(buffer);
  }

  const text = normalizeExtractedText(buffer.toString("utf8"));
  return {
    text,
    pageSpans: text ? [{ pageNumber: 1, startOffset: 0, endOffset: text.length }] : [],
  };
}

export async function extractTextFromFile(file: File): Promise<ParsedDocumentText> {
  const mimeType = file.type;
  const buffer = Buffer.from(await file.arrayBuffer());
  return extractTextFromBuffer(buffer, mimeType);
}
