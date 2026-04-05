"""Query rewrite, Chroma retrieval, and Groq answer generation."""

from __future__ import annotations

import logging
from pathlib import Path

import streamlit as st
from langchain_chroma import Chroma
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from groq import RateLimitError
from langchain_groq import ChatGroq

from documind.config import (
    DEFAULT_RETRIEVAL_K,
    GROQ_ANSWER_FALLBACK_MODEL,
    GROQ_MODEL,
    GROQ_REWRITE_MODEL,
    RETRIEVAL_FALLBACK_POOL_K,
    RETRIEVAL_SIMILARITY_WEAK_ALL,
    ROLE_USER,
)
from documind.session import normalize_stored_role
from documind.text_thai import clean_thai_text

_logger = logging.getLogger(__name__)


def l2_distance_to_similarity(distance: float) -> float:
    """
    Map Chroma L2 distance to a bounded (0, 1] score for UI (higher = closer match).
    Same formula is used to decide when every hit is weak and a wider search is needed.
    """
    d = float(distance)
    if d < 0:
        d = 0.0
    return 1.0 / (1.0 + d)


def _source_label(doc, index: int) -> str:
    page = doc.metadata.get("page")
    src = doc.metadata.get("source_file") or Path(
        doc.metadata.get("source", "")
    ).name
    page_str = f", page {page + 1}" if page is not None else ""
    return f"[Source {index}{page_str} — {src}]"


def format_context_with_citations(docs: list) -> tuple[str, str]:
    """Return (context_block, short_source_list) for the LLM prompt."""
    blocks = []
    summary_parts = []
    for i, doc in enumerate(docs, start=1):
        label = _source_label(doc, i)
        blocks.append(f"{label}\n{doc.page_content.strip()}")
        summary_parts.append(label.strip("[]"))
    return "\n\n---\n\n".join(blocks), "; ".join(summary_parts)


def docs_for_citation_ui(docs: list) -> list[dict]:
    out = []
    for i, doc in enumerate(docs, start=1):
        text = doc.page_content.strip()
        text = clean_thai_text(text)
        if len(text) > 700:
            text = text[:700].rstrip() + "…"
        label = clean_thai_text(_source_label(doc, i))
        l2 = (doc.metadata or {}).get("retrieval_l2")
        if l2 is not None:
            sim = l2_distance_to_similarity(float(l2))
            label = f"{label} (Score: {sim:.2f})"
        out.append({"label": label, "text": text})
    return out


def transcript_from_messages(messages: list[dict], *, max_chars: int = 6000) -> str:
    """
    Flatten prior turns into a single string for retrieval queries and LLM prompts.
    Truncates from the start if needed so recent follow-ups stay in range.
    """
    lines: list[str] = []
    for m in messages:
        role = normalize_stored_role(m.get("role", ""))
        label = "User" if role == ROLE_USER else "Assistant"
        content = (m.get("content") or "").strip()
        if not content:
            continue
        lines.append(f"{label}: {content}")
    if not lines:
        return ""
    text = "\n\n".join(lines)
    if len(text) <= max_chars:
        return text
    return "…\n\n" + text[-max_chars:]


def _document_dedupe_key(doc) -> tuple:
    """Stable key so merged retrieval lists drop duplicate chunks."""
    md = doc.metadata or {}
    src = md.get("source") or md.get("source_file") or ""
    page = md.get("page")
    start = md.get("start_index")
    snippet = (doc.page_content or "")[:120]
    return (src, page, start, snippet)


def chroma_similarity_search_l2_pairs(
    vectorstore: Chroma, query: str, *, k: int
) -> list[tuple[object, float]]:
    """(document, L2 distance) pairs; lower distance is a better match for this embedding setup."""
    return vectorstore.similarity_search_with_score(query, k=k)


def merge_l2_ranked_documents(
    pairs_a: list[tuple[object, float]],
    pairs_b: list[tuple[object, float]],
    *,
    k: int,
) -> list[tuple[object, float]]:
    """
    Union two ranked lists, keep the best L2 distance per chunk, return top-k (doc, distance) pairs.
    Used when the rewritten-query search is weak but the raw query may still match.
    """
    best: dict[tuple, tuple[object, float]] = {}
    for doc, dist in pairs_a + pairs_b:
        key = _document_dedupe_key(doc)
        prev = best.get(key)
        if prev is None or float(dist) < float(prev[1]):
            best[key] = (doc, dist)
    ranked = sorted(best.values(), key=lambda x: float(x[1]))
    return ranked[:k]


STANDALONE_QUERY_SYSTEM = (
    "You are the query-rewriter for a document RAG system. The user messages and assistant "
    "messages below are the real conversation so far.\n\n"
    "Your task: the LAST user message you receive will be a follow-up that may use pronouns "
    "or vague references ('it', 'that', 'this metric', 'the second point'). Rewrite that "
    "follow-up into ONE standalone search query that could be embedded and matched against "
    "PDF text chunks.\n\n"
    "Rules:\n"
    "- Resolve references using the prior user/assistant turns (e.g. if the topic was BLEU, "
    "'How is it calculated?' becomes about BLEU).\n"
    "- Keep the same language as the follow-up (mixed Thai/English is fine).\n"
    "- Do not answer the question; output only the rewritten query.\n"
    "- If the follow-up is already self-contained, return it with at most tiny edits.\n"
    "- **Formatting-only follow-ups (critical):** If the user only asks to reorder, clean up, "
    "shorten, or re-list (e.g. Thai: เรียงดีๆ, เรียงใหม่, จัดใหม่, สรุปใหม่, ทำเป็นข้อๆ), do **not** "
    "use that phrase alone as the search query. Rewrite to the **same concrete topic** as the "
    "most recent substantive user question earlier in the transcript (e.g. names of people in "
    "the document, the prior factual request).\n\n"
    "Example:\n"
    "User: What is BLEU?\n"
    "Assistant: BLEU is a metric for evaluating machine translation quality…\n"
    "Follow-up: How is it calculated?\n"
    "Output: How is BLEU calculated?"
)


def _chat_history_to_lc_messages(chat_history: list[dict]) -> list[HumanMessage | AIMessage]:
    """Turn stored session turns into a LangChain message list (user/ai alternating)."""
    out: list[HumanMessage | AIMessage] = []
    for m in chat_history:
        role = normalize_stored_role(m.get("role", ""))
        content = (m.get("content") or "").strip()
        if not content:
            continue
        if role == ROLE_USER:
            out.append(HumanMessage(content=content))
        else:
            out.append(AIMessage(content=content))
    return out


def _rewrite_to_standalone_query(
    chat_history: list[dict],
    current_question: str,
    *,
    api_key: str,
) -> tuple[str, list[str]]:
    """
    Conversation-chain rewrite for Chroma: prior turns as Human/AI messages, then a final
    user line to emit one standalone search query. Returns (query, warnings).
    """
    warnings_out: list[str] = []
    q = (current_question or "").strip()
    if not q:
        return q, warnings_out
    if not chat_history:
        return q, warnings_out
    lc = _chat_history_to_lc_messages(chat_history)
    if not lc:
        return q, warnings_out
    try:
        llm = ChatGroq(
            model=GROQ_REWRITE_MODEL,
            temperature=0,
            api_key=api_key,
        )
        msgs: list = [SystemMessage(content=STANDALONE_QUERY_SYSTEM)]
        msgs.extend(lc)
        msgs.append(
            HumanMessage(
                content=(
                    "Rewrite ONLY this follow-up into ONE standalone search query (no preamble, "
                    "no explanation):\n\n"
                    f"{q}"
                )
            )
        )
        out = llm.invoke(msgs)
        text = (out.content if hasattr(out, "content") else str(out)).strip()
        if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
            text = text[1:-1].strip()
        if not text:
            warnings_out.append("Standalone rewriter returned empty text; using your exact wording.")
            return q, warnings_out
        if len(text) > 800:
            text = text[:800].rstrip()
        return text, warnings_out
    except Exception as e:
        _logger.exception("Standalone query rewriter failed")
        warnings_out.append(
            f"Standalone rewriter failed ({type(e).__name__}); using your exact wording for search."
        )
        return q, warnings_out


def rewrite_query(
    chat_history: list[dict],
    current_question: str,
    *,
    api_key: str,
) -> tuple[str, list[str]]:
    """
    Produce a conversation-aware search string for ``retrieve_context`` (resolves pronouns
    and follow-ups). Returns ``(query_for_vector_search, warnings)``. Warnings are non-fatal;
    the query always falls back to the user's text if a rewriter step fails.
    """
    text, warnings = _rewrite_to_standalone_query(
        chat_history, current_question, api_key=api_key
    )
    out = (text.strip() or current_question.strip())
    q = (current_question or "").strip()
    # Short follow-ups often rewrite to themselves and retrieve the wrong chunks; widen with transcript.
    if chat_history and len(q) <= 36 and out == q:
        hybrid = build_hybrid_retrieval_query(chat_history, q).strip()
        if len(hybrid) > len(q) + 12:
            warnings = [
                *warnings,
                "Short follow-up: search query expanded with recent conversation context.",
            ]
            return hybrid, warnings
    return out, warnings


def build_hybrid_retrieval_query(chat_history: list[dict], current_question: str) -> str:
    """
    Flat transcript + follow-up for embedding when the standalone line still misses.
    Complements the structured standalone rewriter.
    """
    tail = transcript_from_messages(chat_history, max_chars=2500).strip()
    q = (current_question or "").strip()
    if not tail:
        return q
    return (
        f"{tail}\n\n---\n"
        f"Follow-up (resolve pronouns using the conversation above):\n{q}"
    )


QUERY_REWRITE_SYSTEM = (
    "You are a query optimizer. Rewrite the user's question to improve search retrieval. "
    "Specifically, ensure proper nouns and acronyms (like 'BLEU', 'AI', 'NLP') are capitalized "
    "correctly based on common knowledge. Also, expand the query slightly to include synonyms "
    "if helpful. Output ONLY the rewritten query, nothing else."
)


def _optimize_query_for_embeddings(user_question: str, api_key: str) -> tuple[str, list[str]]:
    """
    Second-stage rewrite right before embedding: acronyms / synonyms. Returns (text, warnings).
    """
    warnings_out: list[str] = []
    q = (user_question or "").strip()
    if not q:
        return q, warnings_out
    try:
        llm = ChatGroq(
            model=GROQ_REWRITE_MODEL,
            temperature=0,
            api_key=api_key,
        )
        out = llm.invoke(
            [
                SystemMessage(content=QUERY_REWRITE_SYSTEM),
                HumanMessage(content=q),
            ]
        )
        text = (out.content if hasattr(out, "content") else str(out)).strip()
        if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
            text = text[1:-1].strip()
        if not text:
            warnings_out.append("Embedding optimizer returned empty; using pre-optimizer text.")
            return q, warnings_out
        if len(text) > 800:
            text = text[:800].rstrip()
        return text, warnings_out
    except Exception as e:
        _logger.exception("Embedding query optimizer failed")
        warnings_out.append(
            f"Embedding optimizer failed ({type(e).__name__}); searching with previous wording."
        )
        return q, warnings_out


def retrieve_context(
    vectorstore: Chroma,
    search_query: str,
    *,
    api_key: str,
    k: int = DEFAULT_RETRIEVAL_K,
) -> list:
    """
    Vector search: optional LLM query optimization, then Chroma L2 search. If the optimized
    query differs from the raw string, results from both searches are merged and de-duplicated
    (top-k by best distance per chunk). If every hit is still low-similarity, widen the pool.
    ``metadata["retrieval_l2"]`` stores distance for UI scores.
    """
    raw = (search_query or "").strip()
    if not raw:
        return []
    rewritten, _ = _optimize_query_for_embeddings(raw, api_key)
    # Retrieve extra candidates from Chroma, then keep only top-k for the LLM (better recall).
    fetch_k = min(max(k * 2, 24), 64)
    pairs_rw = chroma_similarity_search_l2_pairs(vectorstore, rewritten, k=fetch_k)
    merged_pairs: list[tuple[object, float]]
    # When the embedding optimizer changes the query, merge both phrasings — one often matches
    # the PDF better (Thai, terminology).
    if rewritten.strip() == raw.strip():
        merged_pairs = list(pairs_rw[:k])
    else:
        pairs_raw = chroma_similarity_search_l2_pairs(vectorstore, raw, k=fetch_k)
        merged_pairs = merge_l2_ranked_documents(pairs_rw, pairs_raw, k=k)

    if merged_pairs and all(
        l2_distance_to_similarity(dist) < RETRIEVAL_SIMILARITY_WEAK_ALL
        for _, dist in merged_pairs
    ):
        pool_k = max(k * 3, RETRIEVAL_FALLBACK_POOL_K)
        big_rw = chroma_similarity_search_l2_pairs(vectorstore, rewritten, k=pool_k)
        big_raw = chroma_similarity_search_l2_pairs(vectorstore, raw, k=pool_k)
        merged_pairs = merge_l2_ranked_documents(big_rw, big_raw, k=k)

    docs_out: list = []
    for doc, dist in merged_pairs:
        md = dict(doc.metadata or {})
        md["retrieval_l2"] = float(dist)
        doc.metadata = md
        docs_out.append(doc)
    return docs_out


def build_rag_system_prompt() -> str:
    """
    System instructions: strict grounding; single-language answers; no script mixing.
    """
    return (
        "You are DocuMind AI. Answer using ONLY the provided context (excerpts) below.\n\n"
        "**Answer shape (mandatory):**\n"
        "- Start **immediately** with the substantive answer. Do **not** repeat, paraphrase, or "
        "quote the user’s question as a lead-in. Do **not** echo section headers such as "
        "“Current question” or the `###` lines from the prompt.\n"
        "- For lists, use markdown `-` bullets **or** numbered items where the text after "
        "`1.` is on the **same line** (never output a line that is only `1.` or `2.` with "
        "nothing after the dot).\n\n"
        "**Reading depth (mandatory):**\n"
        "- The excerpts are the only text you see from the PDFs this turn. Read **every line** "
        "of **every** excerpt from start to finish — do not skim or skip the middle. Treat "
        "details in later sentences and footnotes in the excerpts as equally important as the "
        "first sentence.\n"
        "- If the user asks broadly, synthesize across all provided blocks; still read each block "
        "in full before answering.\n\n"
        "**Language — follow strictly:**\n"
        "- Detect the primary language of the **current user question** (Thai, English, Chinese, "
        "or other).\n"
        "- Write the **entire** answer in that one language: every sentence and paragraph in the "
        "same language. Do not alternate languages, do not add bilingual glosses "
        "(e.g. avoid Thai sentence + English translation in parentheses line after line).\n"
        "- Allowed exceptions only: (1) citation labels exactly as given, e.g. "
        "[Source 1, page 2 — file.pdf]; (2) proper nouns, product names, or short quotes **copied "
        "verbatim from the excerpts**; (3) acronyms that already appear in the excerpts.\n"
        "- If the question mixes scripts, use the **dominant** language of the question.\n"
        "- **Thai spacing (names):** After honorifics, always insert a space before the person’s "
        "name: นาย, นาง, นางสาว, อาจารย์, ดร., ศ., รศ., ผศ., ศาสตราจารย์, ผู้ช่วยศาสตราจารย์, "
        "รองศาสตราจารย์, etc. (e.g. นาย โมโตโนริ โคโนะ, อาจารย์ อมรพันธ์ ชมกลิ่น, ดร. ณปภัช "
        "วิชัยดิษฐ์). Put a space between **given name and surname** when they are separate "
        "parts in normal Thai usage or in the excerpt. For transliterated foreign names in Thai "
        "script, separate **given** and **family** with a space when they are distinct parts.\n"
        "- When listing several people, use **exactly one line per person** (or one markdown "
        "bullet per person). **Never** put multiple people in a single run-on line separated "
        "only by spaces. If the document states a total count (e.g. 4 people), list that many "
        "lines and match the document.\n"
        "- Use a space between **Thai script and English** letters when they touch "
        "(e.g. “ปัญญาประดิษฐ์ AI”).\n"
        "- Do **not** paste block headers such as `[Overview — excerpt from start of uploaded "
        "document(s)]` into your answer; cite using labels only where a citation is needed.\n\n"
        "**Never claim “not found” too easily (critical):**\n"
        "- Excerpts are **fragments** of the PDF; the same idea may use different words than the "
        "question (synonyms, formal vs colloquial Thai, section titles vs body text).\n"
        "- Read **every** excerpt block before deciding. Ask: could any sentence support the "
        "question **directly, indirectly, or in part**? If yes, answer from those lines and cite — "
        "even if the fit is not perfect or the answer is incomplete.\n"
        "- Combine facts across multiple [Source …] blocks when they belong together.\n"
        "- Say that the **retrieved excerpts** do not contain enough information **only** after "
        "this careful pass, when **no** passage relates to the topic. Do **not** use stock "
        "phrases like “ไม่พบข้อมูลที่ชัดเจนในเอกสารนี้” when any excerpt is even loosely relevant.\n"
        "- Prefer a **partial** answer with citations over a “not found” reply.\n\n"
        "**Topics (e.g. data management):**\n"
        "- Explain **only** from the excerpts; paraphrase in the answer language without adding "
        "outside frameworks.\n\n"
        "**Conversation history** is only for understanding follow-ups (pronouns, “that section”). "
        "Do not treat prior assistant turns as facts unless they match the excerpts; prefer the "
        "excerpts when there is conflict.\n\n"
        "**People, roles, and names (anti-hallucination):**\n"
        "- List **only** people, job titles, groups, or named entities that are **explicitly "
        "supported** by wording in the excerpts (including clear acknowledgments like family or "
        "friends **if** those words appear there). Do **not** pad the list with generic "
        "stakeholders (e.g. ผู้ใช้, หุ้นส่วน, ผู้เชี่ยวชาญ, ทีมการตลาด) unless that exact kind of "
        "phrase appears in the excerpts.\n"
        "- If the user only asks to reorder or polish (e.g. เรียงดีๆ), **reformat without adding "
        "new items** — still grounded only in the excerpts; do not “improve” the list with guesses.\n\n"
        "Cite facts inline with the exact labels from the context. Do not invent page numbers "
        "or sources."
    )


def build_final_answer_messages(
    *,
    chat_history: list[dict],
    context_block: str,
    current_question: str,
    source_summary: str,
) -> list:
    """
    True multi-turn chain for the answer model: system + prior Human/AI turns, then a final
    user message that carries retrieved PDF excerpts + the literal current question.
    """
    msgs: list = [SystemMessage(content=build_rag_system_prompt())]
    msgs.extend(_chat_history_to_lc_messages(chat_history))
    final = (
        "### Retrieved document excerpts (primary ground truth)\n"
        f"{context_block}\n\n"
        "---\n"
        "### Current question\n"
        f"{current_question}\n\n"
        f"Available citation labels: {source_summary}\n\n"
        "Answer using ONLY the excerpts above. Read **every line** of **every** block carefully "
        "(top to bottom) before answering; synthesize across sources when useful. Do **not** say "
        "the document has no information if any excerpt is relevant — give the best grounded "
        "answer you can and cite. Reply in **one language only** (same as the current question). "
        "For lists of Thai names: **one person per line** (or bullet); honorific + space + name; "
        "do not join names with only spaces on one line. Do not append raw `[Overview — …]` text "
        "into the answer body. "
        "Do **not** open by repeating the current question. "
        "Prior turns are for follow-ups only; for facts, trust **these excerpts**, not a prior "
        "assistant reply that might be wrong."
    )
    msgs.append(HumanMessage(content=final))
    return msgs


def invoke_llm_conversation_chain(messages: list, api_key: str) -> str:
    """Groq chat with an arbitrary list of LangChain messages (system + multi-turn + RAG)."""

    def _call(model: str) -> str:
        llm = ChatGroq(model=model, temperature=0, api_key=api_key)
        response = llm.invoke(messages)
        return response.content if hasattr(response, "content") else str(response)

    try:
        return _call(GROQ_MODEL)
    except RateLimitError:
        if GROQ_ANSWER_FALLBACK_MODEL != GROQ_MODEL:
            _logger.warning(
                "Groq rate limit on %s; retrying answer with %s",
                GROQ_MODEL,
                GROQ_ANSWER_FALLBACK_MODEL,
            )
            return _call(GROQ_ANSWER_FALLBACK_MODEL)
        raise


def generate_response(
    *,
    api_key: str,
    context: str,
    source_summary: str,
    chat_history: list[dict],
    current_question: str,
) -> str:
    """
    Final LLM step: multi-turn Human/AI history + retrieved PDF context + current question.
    Returns a user-visible string; on failure, a short fallback message (no exception).
    """
    try:
        messages = build_final_answer_messages(
            chat_history=chat_history,
            context_block=context,
            current_question=current_question,
            source_summary=source_summary,
        )
        raw = invoke_llm_conversation_chain(messages, api_key)
        text = raw if isinstance(raw, str) else str(raw)
        return clean_thai_text(text, strip_echo_of_question=current_question)
    except Exception as e:
        _logger.exception("generate_response failed")
        if isinstance(e, RateLimitError):
            return (
                "The Groq API rate limit was reached for the answer model (and the fallback). "
                "Wait until your quota resets, upgrade your Groq tier, or set "
                "`GROQ_MODEL` / `GROQ_ANSWER_FALLBACK_MODEL` in code or env to another model."
            )
        return (
            "I could not generate a response (model or network error). "
            f"Details: {type(e).__name__}. Please try again."
        )


def run_rag_chat_turn(
    *,
    question: str,
    vectorstore: Chroma,
    api_key: str,
    prior_messages: list[dict],
) -> tuple[str, list[dict]]:
    """
    End-to-end turn: ``rewrite_query`` → ``retrieve_context`` (with fallbacks) →
    ``generate_response``.
    """
    search_query, rewrite_warnings = rewrite_query(prior_messages, question, api_key=api_key)
    if rewrite_warnings:
        _logger.debug("rewrite_query: %s", " | ".join(rewrite_warnings))

    k = DEFAULT_RETRIEVAL_K
    docs = retrieve_context(vectorstore, search_query, api_key=api_key, k=k)
    if not docs and search_query.strip() != question.strip():
        docs = retrieve_context(vectorstore, question, api_key=api_key, k=k)
    if not docs:
        hybrid = build_hybrid_retrieval_query(prior_messages, question)
        if hybrid.strip() != search_query.strip() and hybrid.strip() != question.strip():
            docs = retrieve_context(vectorstore, hybrid, api_key=api_key, k=k)
    if not docs:
        return (
            "I could not find relevant passages in the indexed documents for that question. "
            "Try rephrasing or upload a PDF that covers this topic.",
            [],
        )

    context, source_summary = format_context_with_citations(docs)
    citation_sources = docs_for_citation_ui(docs)
    overview = (st.session_state.get("doc_overview_excerpt") or "").strip()
    if overview:
        ov_label = "[Overview — excerpt from start of uploaded document(s)]"
        context = f"{ov_label}\n{overview}\n\n---\n\n{context}"
        source_summary = f"{ov_label.strip('[]')}; {source_summary}"
        ov_text = clean_thai_text(overview)
        if len(ov_text) > 700:
            ov_text = ov_text[:700].rstrip() + "…"
        citation_sources = [
            {"label": f"{clean_thai_text(ov_label)} (Score: n/a — overview excerpt)", "text": ov_text}
        ] + citation_sources
    reply = generate_response(
        api_key=api_key,
        context=context,
        source_summary=source_summary,
        chat_history=prior_messages,
        current_question=question,
    )
    return reply, citation_sources
