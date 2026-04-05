"""Streamlit session state, chat session lifecycle, Groq API key, and message role helpers."""

from __future__ import annotations

import os
import uuid

import streamlit as st

from documind.chat_db import (
    delete_session as db_delete_session,
    get_all_sessions,
    init_chat_db,
    load_session,
    save_session,
)
from documind.chroma_index import release_vectorstore_for_rebuild
from documind.config import DB_STORAGE_DIR, ROLE_AI, ROLE_USER, ST_ASSISTANT, ST_USER


def get_groq_api_key() -> str | None:
    """
    Resolve GROQ_API_KEY for deployment vs local dev.

    Order: ``st.secrets`` first (Streamlit Cloud / ``.streamlit/secrets.toml``),
    then ``os.environ`` (populated from ``.env`` via load_dotenv or the shell).
    Returns None if neither source provides a non-empty key.
    """
    try:
        if hasattr(st, "secrets") and "GROQ_API_KEY" in st.secrets:
            val = st.secrets["GROQ_API_KEY"]
            if val is not None and str(val).strip():
                return str(val).strip()
    except (FileNotFoundError, KeyError, RuntimeError, TypeError):
        pass
    key = (os.environ.get("GROQ_API_KEY") or "").strip()
    return key or None


def init_session_state() -> None:
    defaults = {
        "messages": [],
        "vectorstore": None,
        "chroma_persist_path": None,
        "last_file_signature": None,
        "embeddings": None,
        "index_error": None,
        "chat_session_id": None,
        "session_saved_file_name": "",
        "session_chroma_index_name": "",
    }
    for key, val in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = val


def _file_label_for_save() -> str:
    """Best-effort document label for the active session row (per chat; no global index fallback)."""
    sig = st.session_state.get("last_file_signature")
    if sig:
        return ", ".join(name for name, _ in sig)
    return (st.session_state.get("session_saved_file_name") or "").strip()


def _apply_session_chroma_binding(data: dict | None) -> None:
    """Point in-memory Chroma binding at this chat's saved ``index_*`` folder (or clear for a fresh chat)."""
    st.session_state.vectorstore = None
    name = ""
    if data:
        name = (data.get("chroma_index_name") or "").strip()
    st.session_state.session_chroma_index_name = name
    if name:
        p = DB_STORAGE_DIR / name
        st.session_state.chroma_persist_path = str(p.resolve()) if p.is_dir() else None
    else:
        st.session_state.chroma_persist_path = None
    st.session_state.last_file_signature = None


def persist_current_session() -> None:
    """Write current messages, file label, and Chroma folder name for ``chat_session_id``."""
    sid = st.session_state.get("chat_session_id")
    if not sid:
        return
    cname = (st.session_state.get("session_chroma_index_name") or "").strip()
    save_session(
        sid,
        _file_label_for_save(),
        list(st.session_state.messages),
        chroma_index_name=cname,
    )


def ensure_chat_session() -> None:
    """
    On cold load (no ``chat_session_id``), create a session or restore the most recently
    updated one from SQLite.
    """
    init_chat_db()
    if st.session_state.get("chat_session_id"):
        return
    sessions = get_all_sessions()
    if not sessions:
        sid = str(uuid.uuid4())
        st.session_state.chat_session_id = sid
        st.session_state.messages = []
        st.session_state.session_saved_file_name = ""
        _apply_session_chroma_binding(None)
        save_session(sid, "", [], chroma_index_name="")
        return
    sid = sessions[0]["session_id"]
    data = load_session(sid)
    if not data:
        start_new_chat_session()
        return
    st.session_state.chat_session_id = data["session_id"]
    st.session_state.messages = list(data["messages"])
    st.session_state.session_saved_file_name = data.get("file_name") or ""
    _apply_session_chroma_binding(data)


def start_new_chat_session() -> None:
    """New chat: no messages, no PDF index binding until the user uploads in this thread."""
    release_vectorstore_for_rebuild()
    st.session_state.chroma_persist_path = None
    st.session_state.session_chroma_index_name = ""
    st.session_state.last_file_signature = None
    sid = str(uuid.uuid4())
    st.session_state.chat_session_id = sid
    st.session_state.messages = []
    st.session_state.session_saved_file_name = ""
    save_session(sid, "", [], chroma_index_name="")


def switch_to_session(session_id: str) -> None:
    data = load_session(session_id)
    if not data:
        return
    release_vectorstore_for_rebuild()
    st.session_state.chat_session_id = data["session_id"]
    st.session_state.messages = list(data["messages"])
    st.session_state.session_saved_file_name = data.get("file_name") or ""
    _apply_session_chroma_binding(data)


def delete_session_and_maybe_reassign(deleted_id: str) -> None:
    db_delete_session(deleted_id)
    if st.session_state.get("chat_session_id") != deleted_id:
        return
    rest = get_all_sessions()
    if not rest:
        start_new_chat_session()
        return
    switch_to_session(rest[0]["session_id"])


def chat_area_title_parts() -> tuple[str, str]:
    """(primary title, subtitle) for the chat header."""
    sid = (st.session_state.get("chat_session_id") or "").strip()
    sig = st.session_state.get("last_file_signature")
    if sig:
        doc_line = ", ".join(name for name, _ in sig)
    else:
        doc_line = (st.session_state.get("session_saved_file_name") or "").strip()
    if not doc_line:
        doc_line = "No document label"
    short = f"{sid[:8]}…" if len(sid) > 8 else (sid or "—")
    return doc_line, f"Session {short}"


def normalize_stored_role(role: str) -> str:
    """Normalize to ``user`` or ``ai`` (accepts legacy human/assistant)."""
    r = (role or "").strip().lower()
    if r in ("user", "human"):
        return ROLE_USER
    if r in ("ai", "assistant"):
        return ROLE_AI
    return r


def streamlit_chat_role(msg: dict) -> str:
    """Map stored role to ``st.chat_message`` (user vs assistant bubble)."""
    return ST_USER if normalize_stored_role(msg.get("role", "")) == ROLE_USER else ST_ASSISTANT
