"""
DocuMind AI — Streamlit RAG app over PDFs with Groq + ChromaDB + local embeddings.

Run::

    python -m streamlit run app.py

Implementation is split under the ``documind/`` package (config, chat DB, Chroma, RAG, session, UI).

API key: ``GROQ_API_KEY`` via Streamlit Secrets (deployed) or ``.env`` / environment (local).
"""

from __future__ import annotations

import warnings
from pathlib import Path

# LangChain still touches Pydantic v1 shims; Python 3.14+ emits a noisy (known) UserWarning.
warnings.filterwarnings(
    "ignore",
    message=r"Core Pydantic V1 functionality isn't compatible with Python 3\.14",
    category=UserWarning,
)

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

from documind.chat_db import get_all_sessions
from documind.chroma_index import (
    chroma_doc_count,
    file_signature,
    get_vector_store,
    process_pdf,
    process_pending_chroma_deletes,
)
from documind.config import ROLE_AI, ROLE_USER, ST_ASSISTANT, ST_USER
from documind.rag import run_rag_chat_turn
from documind.session import (
    chat_area_title_parts,
    delete_session_and_maybe_reassign,
    ensure_chat_session,
    get_groq_api_key,
    init_session_state,
    persist_current_session,
    start_new_chat_session,
    streamlit_chat_role,
    switch_to_session,
)
from documind.ui import render_about_page, render_source_cards, scroll_chat_to_bottom


def main() -> None:
    init_session_state()
    process_pending_chroma_deletes()

    st.set_page_config(
        page_title="DocuMind AI",
        page_icon="📄",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    ensure_chat_session()

    st.markdown(
        """
        <style>
        @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap");
        @import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap");

        .block-container { padding-top: 1.5rem; }
        [data-testid="stSidebar"] { border-right: 1px solid rgba(128,128,128,0.2); }

        /* Streamlit icons use Material Symbols — do not override with Thai stack */
        [data-testid="stIconMaterial"],
        [data-testid="stHeader"] button,
        [data-testid="stHeader"] [data-testid="stIconMaterial"] {
            font-family: "Material Symbols Outlined" !important;
            font-weight: normal !important;
            font-style: normal !important;
            font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24 !important;
            letter-spacing: normal !important;
        }

        /* Thai only where real prose is rendered (avoids broken uploader / sidebar icons) */
        [data-testid="stMarkdownContainer"],
        [data-testid="stMarkdownContainer"] p,
        [data-testid="stMarkdownContainer"] li,
        [data-testid="stMarkdownContainer"] ol,
        [data-testid="stMarkdownContainer"] ul,
        [data-testid="stChatMessage"] [data-testid="stMarkdownContainer"],
        [data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] p,
        [data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] li,
        [data-testid="stCaption"],
        [data-testid="stHeading"],
        [data-testid="stHeading"] span,
        h1, h2, h3 {
            font-family: "Noto Sans Thai", "Leelawadee UI", "Leelawadee", "Sarabun",
                "Tahoma", "Segoe UI", ui-sans-serif, system-ui, sans-serif !important;
        }

        [data-testid="stMarkdownContainer"] p,
        [data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] p {
            line-height: 1.7;
            word-break: normal;
            overflow-wrap: anywhere;
        }

        /* Chat thread: clearer alternating user / assistant bubbles */
        section.main [data-testid="stChatMessage"] {
            border-radius: 12px;
            margin-bottom: 0.75rem !important;
            padding: 0.2rem 0.15rem;
            border: 1px solid rgba(128, 128, 128, 0.14);
            background: rgba(128, 128, 128, 0.04);
        }

        .stTextInput input,
        .stTextArea textarea,
        [data-baseweb="textarea"] textarea,
        [data-testid="stChatInput"] textarea {
            font-family: "Noto Sans Thai", "Leelawadee UI", "Leelawadee", "Sarabun",
                "Tahoma", "Segoe UI", ui-sans-serif, system-ui, sans-serif !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    api_key = get_groq_api_key()

    with st.sidebar:
        page = st.radio(
            "Go to",
            ["Chat", "About"],
            horizontal=True,
            key="documind_nav",
        )

        if page == "About":
            st.caption("Use the radio above to return to **Chat**.")
        else:
            st.header("Documents")
            if not api_key:
                st.warning(
                    "No **GROQ_API_KEY** found. You can paste it below, or set it in "
                    "Streamlit **Secrets** (deployed) / **.env** (local)."
                )
                st.text_input(
                    "Groq API Key",
                    key="runtime_groq_api_key",
                    type="password",
                    placeholder="gsk_...",
                    help="Used only for this active app session.",
                )
                api_key = get_groq_api_key()
                if api_key:
                    st.success("Using API key from sidebar input.")
            else:
                st.success("Ready — API key configured.")

            _sid = st.session_state.get("chat_session_id") or "default"
            uploaded = st.file_uploader(
                "Upload or replace PDF file(s)",
                type=["pdf"],
                accept_multiple_files=True,
                help=(
                    "First upload: builds a saved index under ./db_storage for this chat. "
                    "After that, refresh or use Open — you normally do **not** upload again. "
                    "Upload again only to replace documents."
                ),
                key=f"documind_pdf_upload_{_sid}",
            )

            sig = file_signature(uploaded)
            if uploaded and sig != st.session_state.last_file_signature:
                with st.spinner("Indexing PDFs (chunking + embeddings)…"):
                    try:
                        vs = process_pdf(uploaded)
                        st.session_state.vectorstore = vs
                        if vs is not None:
                            st.session_state.last_file_signature = sig
                            st.session_state.session_saved_file_name = ", ".join(
                                f.name for f in uploaded
                            )
                            persist_current_session()
                            st.success(
                                f"Indexed **{len(uploaded)}** file(s). "
                                "Search index and PDF copies are **saved on disk** for this chat — "
                                "no need to upload again after refresh."
                            )
                        elif st.session_state.index_error:
                            st.warning(st.session_state.index_error)
                    except Exception as e:
                        st.session_state.vectorstore = None
                        st.session_state.index_error = str(e)
                        st.error(f"Indexing failed: {e}")

            cname = (st.session_state.get("session_chroma_index_name") or "").strip()
            if cname:
                vs_disk = get_vector_store()
                pp = st.session_state.get("chroma_persist_path")
                n = chroma_doc_count(Path(pp)) if pp else 0
                doc_names = (st.session_state.get("session_saved_file_name") or "").strip()
                if vs_disk is not None:
                    st.info(
                        "**Documents are stored on disk** for this chat (vector index + copies in "
                        f"`db_storage/{cname}/`). You **do not need to upload again** after a page "
                        "refresh or when you return with **Open** — continue asking questions."
                        + (f" (~**{n}** text chunks indexed.)" if n else "")
                    )
                    if doc_names:
                        st.caption(f"Active: {doc_names}")
                elif pp and Path(pp).is_dir():
                    st.warning(
                        "Index folder exists but the vector store could not load. Try uploading the PDFs again."
                    )

            st.divider()
            st.subheader("Previous Conversations")
            if st.button("New Chat", use_container_width=True, key="documind_new_chat"):
                start_new_chat_session()
                st.rerun()

            current_sid = st.session_state.get("chat_session_id")
            for row in get_all_sessions():
                sid = row["session_id"]
                is_current = sid == current_sid
                ts = (row.get("updated_at") or row.get("created_at") or "").strip()
                fn = (row.get("file_name") or "").strip() or "No file"
                label = f"{fn[:42]}{'…' if len(fn) > 42 else ''}"
                with st.container():
                    st.caption(f"{ts} · {label}")
                    b_open, b_del = st.columns(2)
                    with b_open:
                        if st.button(
                            "Open" if not is_current else "Current",
                            key=f"documind_open_{sid}",
                            use_container_width=True,
                            disabled=is_current,
                        ):
                            switch_to_session(sid)
                            st.rerun()
                    with b_del:
                        if st.button(
                            "Delete",
                            key=f"documind_del_{sid}",
                            use_container_width=True,
                        ):
                            delete_session_and_maybe_reassign(sid)
                            st.rerun()

            st.divider()
            if st.button("Clear Conversation", use_container_width=True):
                st.session_state.messages = []
                persist_current_session()
                st.rerun()

            with st.expander("Tips"):
                st.markdown(
                    "- Each chat has its **own saved folder** under `db_storage/` (index + original PDF copies). "
                    "**New Chat** starts empty until you upload.\n"
                    "- **Open** restores messages **and** the saved documents — **no re-upload** needed.\n"
                    "- Chat list is stored in **./db_storage/chat_history.sqlite3**.\n"
                    "- **Clear Conversation** clears messages only; saved PDFs and index stay.\n"
                    "- **Delete** removes the chat row and queues its index folder for deletion.\n"
                    "- Upload again **only** when you want to **replace** documents for this chat."
                )

    if page == "About":
        render_about_page()
        return

    st.title("DocuMind AI")
    doc_line, sess_line = chat_area_title_parts()
    st.markdown(f"**{doc_line}** · _{sess_line}_")
    st.caption("Ask questions about your PDFs — answers grounded in your documents with citations.")

    vectorstore = get_vector_store()

    if vectorstore is None:
        st.info(
            "Upload **PDF** files in the sidebar for **this chat**, or **Open** a previous chat "
            "that already has documents indexed."
        )

    for msg in st.session_state.messages:
        with st.chat_message(streamlit_chat_role(msg)):
            st.markdown(msg["content"])
            if streamlit_chat_role(msg) == ST_ASSISTANT and msg.get("sources"):
                render_source_cards(msg["sources"], expanded=False)

    prompt = st.chat_input("Ask a question about your documents…")
    if not prompt:
        return

    st.session_state.messages.append({"role": ROLE_USER, "content": prompt})
    persist_current_session()
    with st.chat_message(ST_USER):
        st.markdown(prompt)

    with st.chat_message(ST_ASSISTANT):
        sources: list[dict] = []
        prior_for_llm = st.session_state.messages[:-1]

        if not api_key:
            reply = (
                "I cannot call the language model until **GROQ_API_KEY** is set "
                "(Streamlit Secrets when deployed, or `.env` / environment locally)."
            )
            st.error(reply)
        elif vectorstore is None:
            reply = (
                "No document index is available yet. Please upload at least one PDF in the sidebar "
                "and wait for indexing to finish."
            )
            st.warning(reply)
        else:
            try:
                with st.spinner("Retrieving context and generating answer…"):
                    reply, sources = run_rag_chat_turn(
                        question=prompt,
                        vectorstore=vectorstore,
                        api_key=api_key,
                        prior_messages=prior_for_llm,
                    )
                st.markdown(reply)
                if sources:
                    render_source_cards(sources, expanded=False)
            except Exception as e:
                err_msg = str(e).lower()
                if "rate" in err_msg or "limit" in err_msg:
                    reply = "The Groq API reported a rate or usage limit. Please wait a moment and try again."
                elif "401" in str(e) or "unauthorized" in err_msg:
                    reply = "Authentication with Groq failed. Check that **GROQ_API_KEY** is valid."
                else:
                    reply = f"Something went wrong while generating the answer: `{e}`"
                st.error(reply)

        assistant_msg: dict = {"role": ROLE_AI, "content": reply}
        if sources:
            assistant_msg["sources"] = sources
        st.session_state.messages.append(assistant_msg)
        persist_current_session()

    scroll_chat_to_bottom()


if __name__ == "__main__":
    main()
