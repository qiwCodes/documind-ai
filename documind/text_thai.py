"""Post-process LLM output: repair Thai glyph spacing; preserve code fences."""

from __future__ import annotations

import re

# Thai Unicode block (primary script for this app).
_RE_HAS_THAI = re.compile(r"[\u0E00-\u0E7F]")
# Markdown / fenced code: leave untouched so English and snippets are not altered.
_RE_FENCED_CODE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
_RE_INLINE_CODE = re.compile(r"`[^`\r\n]*`")

# --- Thai syllable repair (LLMs often insert spaces between glyphs) ---
_RE_TH_LEAD_VOWEL_CONS = re.compile(
    r"([\u0E40-\u0E44])[ \t\u00A0]+([\u0E01-\u0E2E])"
)
_RE_TH_MARK_NEXT = re.compile(
    r"([\u0E34-\u0E37\u0E47-\u0E4E])[ \t\u00A0]+([\u0E01-\u0E2E\u0E40-\u0E44])"
)
_RE_TH_CONS_VOWEL = re.compile(
    r"([\u0E01-\u0E2E])[ \t\u00A0]+([\u0E30-\u0E33\u0E34-\u0E37\u0E38-\u0E39\u0E47-\u0E4E])"
)
_RE_TH_CONS_LEAD_VOWEL = re.compile(
    r"([\u0E01-\u0E2E])[ \t\u00A0]+([\u0E40-\u0E44])"
)
_RE_TH_SARA_CONS = re.compile(r"([\u0E30-\u0E33])[ \t\u00A0]+([\u0E01-\u0E2E])")
_RE_SPACED_CAPS_ACRONYM = re.compile(r"\b(?:[A-Z]\s+){2,}[A-Z]\b")
# Thai ↔ Latin boundary (e.g. "นามสกุลAI" → "นามสกุล AI") without touching Thai–Thai word spaces.
_RE_THAI_THEN_LATIN = re.compile(r"([\u0E00-\u0E7F])([A-Za-z])")
_RE_LATIN_THEN_THAI = re.compile(r"([A-Za-z])([\u0E00-\u0E7F])")
# Longest first so นางสาว wins over นาง.
_THAI_NAME_PREFIXES_LONGEST_FIRST: tuple[str, ...] = (
    "ผู้ช่วยศาสตราจารย์",
    "รองศาสตราจารย์",
    "ศาสตราจารย์",
    "นางสาว",
    "อาจารย์",
    "นาง",
    "นาย",
    "ดร.",
    "รศ.",
    "ผศ.",
    "ศ.",
)
# Model sometimes pastes this RAG label into the answer body; strip it (real citations use it in context only).
_RE_OVERVIEW_LABEL_LEAK = re.compile(
    r"\s*\[Overview — excerpt from start of uploaded document\(s\)\]\s*",
    re.IGNORECASE,
)
_RE_ORPHAN_ENUM_LINE = re.compile(r"^\s*\d+\.\s*$")


def _norm_for_echo_compare(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    s = s.replace("**", "").replace("*", "").strip()
    return s


def _line_is_question_echo(line: str, question_norm: str) -> bool:
    if not question_norm:
        return False
    ln = _norm_for_echo_compare(line)
    if not ln:
        return False
    if ln == question_norm:
        return True
    for suf in (":", "：", ".", "…", "!"):
        if ln == question_norm + suf:
            return True
    for prefix in ("คำตอบ", "ตอบ", "Answer"):
        if ln.startswith(prefix):
            rest = ln[len(prefix) :].lstrip().lstrip(":：").strip()
            if _norm_for_echo_compare(rest) == question_norm:
                return True
    return False


def strip_leading_echo_of_question(text: str, question: str) -> str:
    """Remove one or more leading lines that only repeat the user's question (common LLM glitch)."""
    if not text or not (question or "").strip():
        return text
    qn = _norm_for_echo_compare(question)
    if not qn:
        return text
    remaining = text.lstrip()
    for _ in range(5):
        if not remaining:
            return text
        first, sep, rest = remaining.partition("\n")
        if _line_is_question_echo(first, qn):
            remaining = rest.lstrip("\n").lstrip()
        else:
            break
    if remaining != text.lstrip():
        return remaining if remaining.strip() else text
    return text


def strip_orphan_numbered_list_markers(text: str) -> str:
    """Drop lines that are only ``1.`` / ``2.`` with no item text (breaks list rendering)."""
    if not text:
        return text
    lines = text.split("\n")
    kept = [ln for ln in lines if not _RE_ORPHAN_ENUM_LINE.match(ln)]
    return "\n".join(kept)


def _insert_spaces_after_thai_name_prefixes(text: str) -> str:
    """
    Insert a space after common Thai honorifics when glued to the following name
    (e.g. นายสมชาย → นาย สมชาย, อาจารย์อมร → อาจารย์ อมร, ดร.ณปภัช → ดร. ณปภัช).
    """
    s = text
    thai_after = r"([\u0E01-\u0E2E\u0E40-\u0E44\u0E30-\u0E39])"
    for prefix in _THAI_NAME_PREFIXES_LONGEST_FIRST:
        pat = re.compile(re.escape(prefix) + thai_after)

        def _sub(m: re.Match[str], p: str = prefix) -> str:
            return f"{p} {m.group(1)}"

        s = pat.sub(_sub, s)
    return s


def strip_leaked_rag_labels(text: str) -> str:
    """Remove overview source headers mistakenly copied into the assistant reply."""
    if not text:
        return text
    return _RE_OVERVIEW_LABEL_LEAK.sub(" ", text)


def break_runon_thai_person_list(text: str) -> str:
    """
    When the model prints several people in one line (…กุล นาย ณัฐ… อาจารย์ ดร.…),
    break before each new honorific-led entry so each person is on its own line.
    """
    if not text or not _RE_HAS_THAI.search(text):
        return text
    # Space + lookahead for Thai honorific (longest titles not needed here; line starts with these)
    pat = re.compile(r" (?=นาย |นางสาว |นาง |อาจารย์ )")
    if not pat.search(text):
        return text
    parts = pat.split(text)
    if len(parts) < 2:
        return text
    joined = "\n".join(p.strip() for p in parts if p.strip())
    return re.sub(r"\n{3,}", "\n\n", joined)


def _clean_thai_text_segment(segment: str) -> str:
    """
    Fix intra-Thai spaces inside one prose segment (no code fences).

    Illustrative fixes (model-dependent):
      - "เ ดื อ น" → "เดือน"
      - "ภ า ศ า" / "ข้ อ มู ล" → tighter forms via targeted merges
      - "B L E U" → "BLEU"
      - Single spaces between Thai **words** (e.g. ชื่อ นามสกุล) are kept — we do not merge
        all Thai–Thai gaps (that used to destroy name boundaries).
      - "ข้อมูลAI" → "ข้อมูล AI" (thin boundary Thai / Latin)
    """
    if not segment or not _RE_HAS_THAI.search(segment):
        return segment

    def _squash_spaced_caps(m: re.Match[str]) -> str:
        return re.sub(r"\s+", "", m.group(0))

    s = _RE_SPACED_CAPS_ACRONYM.sub(_squash_spaced_caps, segment)

    narrow_round = (
        _RE_TH_LEAD_VOWEL_CONS,
        _RE_TH_MARK_NEXT,
        _RE_TH_CONS_VOWEL,
        _RE_TH_CONS_LEAD_VOWEL,
        _RE_TH_SARA_CONS,
    )
    prev = None
    for _ in range(32):
        for rx in narrow_round:
            s = rx.sub(r"\1\2", s)
        if s == prev:
            break
        prev = s

    s = _insert_spaces_after_thai_name_prefixes(s)

    s = _RE_THAI_THEN_LATIN.sub(r"\1 \2", s)
    s = _RE_LATIN_THEN_THAI.sub(r"\1 \2", s)

    s = re.sub(r"[ \t\u00A0]{2,}", " ", s)
    return s


def _clean_prose_respecting_inline_code(segment: str) -> str:
    """Clean Thai inside ``segment`` but skip inline ``...`` spans (not used inside fences)."""
    if not segment:
        return segment
    out: list[str] = []
    pos = 0
    for m in _RE_INLINE_CODE.finditer(segment):
        if m.start() > pos:
            out.append(_clean_thai_text_segment(segment[pos : m.start()]))
        out.append(m.group(0))
        pos = m.end()
    if pos < len(segment):
        out.append(_clean_thai_text_segment(segment[pos:]))
    return "".join(out)


def clean_thai_text(text: str, *, strip_echo_of_question: str | None = None) -> str:
    """
    Post-process visible LLM text: repair Thai glyph spacing, preserve fenced/inline code.

    English paragraphs without Thai return immediately. Fenced blocks (```...```) are kept
    verbatim; inline `...` in prose is skipped so identifiers stay intact.

    ``strip_echo_of_question``: when set (assistant replies only), drop a leading line that
    duplicates the user's question.
    """
    if not text:
        return text
    text = strip_leaked_rag_labels(text)
    if not _RE_HAS_THAI.search(text):
        return re.sub(r"[ \t\u00A0]{2,}", " ", text).strip()

    out: list[str] = []
    pos = 0
    for m in _RE_FENCED_CODE.finditer(text):
        if m.start() > pos:
            out.append(_clean_prose_respecting_inline_code(text[pos : m.start()]))
        out.append(m.group(0))
        pos = m.end()
    if pos < len(text):
        out.append(_clean_prose_respecting_inline_code(text[pos:]))
    merged = "".join(out)
    merged = re.sub(r"[ \t\u00A0]{2,}", " ", merged)
    merged = break_runon_thai_person_list(merged)
    merged = re.sub(r" *\n *", "\n", merged)
    merged = strip_orphan_numbered_list_markers(merged)
    merged = merged.strip()
    if strip_echo_of_question:
        merged = strip_leading_echo_of_question(merged, strip_echo_of_question).strip()
    return merged
