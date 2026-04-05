"""Streamlit UI fragments (sources, scroll, About)."""

from __future__ import annotations

import os

import streamlit as st

from documind.config import (
    DB_STORAGE_DIR,
    DEFAULT_RETRIEVAL_K,
    EMBED_MODEL,
    GROQ_MODEL,
    RETRIEVAL_FALLBACK_POOL_K,
)
from documind.text_thai import clean_thai_text


def render_source_cards(sources: list[dict], *, expanded: bool = False) -> None:
    """Citation UI: one bordered container per source (professional card-like layout)."""
    with st.expander("Sources used", expanded=expanded):
        st.caption(
            "Retrieved passages supporting this answer. **Score** is a similarity derived from "
            "vector distance (higher is a closer match): 1 ÷ (1 + L2 distance)."
        )
        for src in sources:
            with st.container(border=True):
                label = clean_thai_text(str(src.get("label", "")))
                body = clean_thai_text(str(src.get("text", "")))
                st.markdown(f"**{label}**")
                st.caption(body)


def scroll_chat_to_bottom() -> None:
    """
    Scroll the main app column to the end after a new message (Streamlit has no
    native chat scroll API). Uses the parent document from the embedded iframe.
    """
    st.iframe(
        """<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
<script>
function scrollMain() {
    try {
        const doc = window.parent.document;
        const main = doc.querySelector('section.main');
        if (main) {
            main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
        }
    } catch (e) { /* cross-origin or embed restrictions */ }
}
scrollMain();
setTimeout(scrollMain, 120);
setTimeout(scrollMain, 350);
</script>
</body></html>""",
        width=1,
        height=1,
    )


def render_about_page() -> None:
    """Stack / deployment metadata kept out of the main chat sidebar."""
    st.header("About DocuMind AI")
    st.markdown(
        "This portfolio demo answers questions from your PDFs using retrieval-augmented "
        "generation (RAG). Technical configuration:"
    )
    persist = st.session_state.get("chroma_persist_path")
    store_display = f"`./{DB_STORAGE_DIR.as_posix()}`"
    if persist:
        try:
            rel = os.path.relpath(persist, start=os.getcwd())
            store_display += f" — active index: `{rel}`"
        except ValueError:
            store_display += f" — active index: `{persist}`"

    st.markdown(
        f"- **LLM:** `{GROQ_MODEL}` (Groq)\n"
        f"- **Embeddings:** `{EMBED_MODEL}` (local, Hugging Face)\n"
        f"- **Vector store:** ChromaDB persisted under {store_display}\n"
        f"- **Retrieval:** top-{DEFAULT_RETRIEVAL_K} chunks (wider pool {RETRIEVAL_FALLBACK_POOL_K} if all matches are weak); "
        f"source scores use 1÷(1+L2 distance)\n"
        f"- **Chunking:** recursive split, chunk size 500, overlap 200\n"
        f"- **Persistence:** each chat’s `index_*` folder keeps Chroma data plus **`original_pdfs/`** "
        f"(uploaded file copies) and `original_manifest.json` — reopen the chat to keep using them "
        f"without re-uploading.\n"
    )
    st.markdown(
        "**API key:** On Streamlit Cloud, set `GROQ_API_KEY` in Secrets. "
        "Locally, use a `.env` file or your shell environment."
    )
