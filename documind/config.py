"""Paths, model names, retrieval thresholds, and role constants."""

import os
from pathlib import Path


def _env_str(key: str, default: str) -> str:
    v = (os.environ.get(key) or "").strip()
    return v if v else default

# ---------------------------------------------------------------------------
# Config — relative paths so the app works when deployed (cwd = project root).
# Chroma persistence lives under ./db_storage (was ./db in earlier versions).
# ---------------------------------------------------------------------------
DB_STORAGE_DIR = Path("db_storage")
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
GROQ_MODEL = _env_str("GROQ_MODEL", "llama-3.3-70b-versatile")
# Smaller Groq model for the extra retrieval-time rewrite call (low latency).
GROQ_REWRITE_MODEL = _env_str("GROQ_REWRITE_MODEL", "llama-3.1-8b-instant")
# Used when the primary answer model returns 429 (e.g. per-model tokens-per-day on free tier).
GROQ_ANSWER_FALLBACK_MODEL = _env_str(
    "GROQ_ANSWER_FALLBACK_MODEL", "llama-3.1-8b-instant"
)
# Default number of chunks merged into the final LLM context (higher k reduces false negatives).
DEFAULT_RETRIEVAL_K = 12
# When every top-k hit maps to similarity below this (see ``l2_distance_to_similarity``), widen the pool.
RETRIEVAL_SIMILARITY_WEAK_ALL = 0.5
# Candidate pool size for the widened similarity search (merge + re-rank to top-k).
RETRIEVAL_FALLBACK_POOL_K = 40

PENDING_CHROMA_DELETE = DB_STORAGE_DIR / ".pending_chroma_delete"
CHAT_HISTORY_DB = DB_STORAGE_DIR / "chat_history.sqlite3"

# Canonical roles in st.session_state["messages"] (persist in SQLite; cleared on **Clear Conversation**
# for the current thread only). Legacy keys (human/assistant) are normalized on read.
ROLE_USER = "user"
ROLE_AI = "ai"
# Streamlit chat bubbles expect "user" / "assistant".
ST_USER = "user"
ST_ASSISTANT = "assistant"
