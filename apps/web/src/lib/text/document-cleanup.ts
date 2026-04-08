const THAI_ONLY_TOKEN = /^[ก-๙่-๋็-๎]+$/u;
const THAI_TITLE_OR_KEEP_TOKEN = new Set([
  "นาย",
  "นาง",
  "นางสาว",
  "ดร",
  "ดร.",
  "อาจารย์",
  "บริษัท",
  "คณะ",
  "สาขา",
  "ชื่อ",
  "สกุล",
]);
const COMMON_THAI_ARTIFACT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/คาแนะนา/gu, "คำแนะนำ"],
  [/คาบรรยาย/gu, "คำบรรยาย"],
  [/คาปรึกษา/gu, "คำปรึกษา"],
  [/คาอธิบาย/gu, "คำอธิบาย"],
  [/คาถาม/gu, "คำถาม"],
  [/คาศัพท์/gu, "คำศัพท์"],
  [/คาสั่ง/gu, "คำสั่ง"],
  [/ผู้จัดทา/gu, "ผู้จัดทำ"],
  [/จัดทา/gu, "จัดทำ"],
  [/ทาการ/gu, "ทำการ"],
  [/ทาให้/gu, "ทำให้"],
  [/ทางาน/gu, "ทำงาน"],
  [/สาหรับ/gu, "สำหรับ"],
  [/สาคัญ/gu, "สำคัญ"],
  [/สาเร็จ/gu, "สำเร็จ"],
  [/สาเนา/gu, "สำเนา"],
  [/ดาเนิน/gu, "ดำเนิน"],
  [/จานวน/gu, "จำนวน"],
  [/จากัด/gu, "จำกัด"],
  [/ตาแหน่ง/gu, "ตำแหน่ง"],
  [/ประจาวัน/gu, "ประจำวัน"],
  [/ประจาสัปดาห์/gu, "ประจำสัปดาห์"],
  [/ประจาเดือน/gu, "ประจำเดือน"],
  [/ประจาปี/gu, "ประจำปี"],
  [/นาเสนอ/gu, "นำเสนอ"],
  [/นาไป/gu, "นำไป"],
  [/นามา/gu, "นำมา"],
  [/กาหนด/gu, "กำหนด"],
];

function isThaiOnlyToken(token: string): boolean {
  return THAI_ONLY_TOKEN.test(token);
}

function isLikelyThaiFragment(token: string): boolean {
  if (!isThaiOnlyToken(token)) {
    return false;
  }

  if (THAI_TITLE_OR_KEEP_TOKEN.has(token)) {
    return false;
  }

  const bareToken = token.replace(/[่-๋็-๎]/g, "");
  return bareToken.length <= 3;
}

function collapseThaiFragmentedLine(line: string): string {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return line.trim();
  }

  const merged = [tokens[0]!];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const previous = merged[merged.length - 1]!;
    const shouldJoin =
      (isThaiOnlyToken(token) && isLikelyThaiFragment(token) && /[ก-๙่-๋็-๎]$/u.test(previous)) ||
      (isThaiOnlyToken(previous) && isLikelyThaiFragment(previous) && isThaiOnlyToken(token));

    if (shouldJoin) {
      merged[merged.length - 1] = `${previous}${token}`;
      continue;
    }

    merged.push(token);
  }

  return merged.join(" ");
}

function normalizeDocumentArtifacts(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/\u200B/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function applyReadableSpacing(text: string): string {
  return text
    .replace(/ชื่อ\s*[–-]?\s*ส\s*ก\s*ุ\s*ล/gu, "ชื่อ-สกุล")
    .replace(/(?<!\s)(ผู้เขียน|ผู้จัดทำ|อาจารย์ที่ปรึกษา|พนักงานที่ปรึกษา|ชื่อบริษัท|วันเดือนปีเกิด|คณะวิชา|สาขาวิชา|ชื่อ-สกุล)/gu, " $1")
    .replace(
      /(ผู้เขียน|ผู้จัดทำ|อาจารย์ที่ปรึกษา|พนักงานที่ปรึกษา|ประธานกรรมการสอบ|กรรมการสอบ|ชื่อบริษัท|วันเดือนปีเกิด|ชื่อ-สกุล)(?=(นาย|นางสาว|นาง|อาจารย์|ดร\.?))/gu,
      "$1 ",
    )
    .replace(/(นาย|นางสาว|นาง|ดร\.)(?=[ก-๙A-Za-z])/gu, "$1 ")
    .replace(/(อาจารย์)(?=(?!ที่)[ก-๙A-Za-z])/gu, "$1 ")
    .replace(/(?<=[ก-๙])(?=(คณะวิชา|สาขาวิชา|ชื่อบริษัท|วันเดือนปีเกิด|ผู้จัดทำ))/gu, " ")
    .replace(/\s+([,.;:!?%)\]])/g, "$1")
    .replace(/([([{\]])\s+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applyCommonThaiCorrections(text: string): string {
  let corrected = text
    .replace(/วันท\s*[ี่]+\s*(\d)/gu, "วันที่ $1")
    .replace(/พ\.\s*ศ\./gu, "พ.ศ.")
    .replace(/วัน\s+เดือน\s+ปีเกิด/gu, "วันเดือนปีเกิด")
    .replace(/\b(25\d)\s+(\d)\b/gu, "$1$2")
    .replace(/ผู้จัดท\s+า/gu, "ผู้จัดทำ")
    .replace(/จัดท\s+า/gu, "จัดทำ")
    .replace(/ประจ\s+า(?=(วัน|สัปดาห์|เดือน|ปี))/gu, "ประจำ")
    .replace(/ค\s+า(?=(บรรยาย|ปรึกษา|อธิบาย|แนะนา|ถาม|ศัพท์|สั่ง))/gu, "คำ")
    .replace(/ท\s+า(?=(การ|ให้|งาน|ความ))/gu, "ทำ")
    .replace(/ด\s+า(?=เนิน)/gu, "ดำ")
    .replace(/จ\s+า(?=(นวน|กัด))/gu, "จำ")
    .replace(/ต\s+า(?=แหน่ง)/gu, "ตำ")
    .replace(/ส\s+า(?=(หรับ|คัญ|เร็จ|เนา))/gu, "สำ")
    .replace(/น\s+า(?=(เสนอ|ไป|มา))/gu, "นำ")
    .replace(/ใ\s+ช้/gu, "ใช้");

  for (const [pattern, replacement] of COMMON_THAI_ARTIFACT_REPLACEMENTS) {
    corrected = corrected.replace(pattern, replacement);
  }

  return corrected;
}

export function cleanDocumentTextForReading(text: string): string {
  const normalized = normalizeDocumentArtifacts(text);
  if (!normalized) {
    return "";
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => collapseThaiFragmentedLine(line))
        .join(" ")
        .trim(),
    )
    .filter(Boolean);

  return applyCommonThaiCorrections(applyReadableSpacing(paragraphs.join("\n\n")));
}

export function normalizeDocumentTextForSearch(text: string): string {
  return cleanDocumentTextForReading(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
