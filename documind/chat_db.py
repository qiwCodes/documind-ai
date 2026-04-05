"""Persistent chat history in SQLite."""

import json
import sqlite3
from contextlib import contextmanager

from documind.chroma_index import queue_old_chroma_for_deletion
from documind.config import CHAT_HISTORY_DB, DB_STORAGE_DIR


@contextmanager
def _chat_db_conn() -> sqlite3.Connection:
    DB_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(CHAT_HISTORY_DB))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_chat_db() -> None:
    """Create ``chat_sessions`` table and optional ``updated_at`` column for ordering."""
    with _chat_db_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                file_name TEXT,
                messages TEXT
            )
            """
        )
        cur = conn.execute("PRAGMA table_info(chat_sessions)")
        cols = {row[1] for row in cur.fetchall()}
        if "updated_at" not in cols:
            conn.execute(
                "ALTER TABLE chat_sessions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            )
        if "chroma_index_name" not in cols:
            conn.execute("ALTER TABLE chat_sessions ADD COLUMN chroma_index_name TEXT")


def save_session(
    session_id: str,
    file_name: str | None,
    messages: list[dict],
    *,
    chroma_index_name: str = "",
) -> None:
    """Insert or update a row by ``session_id``; ``messages`` as JSON; ``chroma_index_name`` = ``index_*`` folder under ``db_storage``."""
    init_chat_db()
    fn = (file_name or "").strip()
    payload = json.dumps(messages, ensure_ascii=False)
    cname = chroma_index_name.strip()
    with _chat_db_conn() as conn:
        conn.execute(
            """
            INSERT INTO chat_sessions (session_id, file_name, messages, updated_at, chroma_index_name)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                file_name = excluded.file_name,
                messages = excluded.messages,
                updated_at = CURRENT_TIMESTAMP,
                chroma_index_name = excluded.chroma_index_name
            """,
            (session_id, fn, payload, cname or None),
        )


def load_session(session_id: str) -> dict | None:
    """Return ``session_id``, ``file_name``, ``messages``, ``chroma_index_name`` or None if missing."""
    init_chat_db()
    with _chat_db_conn() as conn:
        row = conn.execute(
            """
            SELECT session_id, file_name, messages, chroma_index_name
            FROM chat_sessions WHERE session_id = ?
            """,
            (session_id,),
        ).fetchone()
    if row is None:
        return None
    raw = row["messages"] or "[]"
    try:
        msgs = json.loads(raw)
        if not isinstance(msgs, list):
            msgs = []
    except (json.JSONDecodeError, TypeError):
        msgs = []
    cix = row["chroma_index_name"]
    return {
        "session_id": row["session_id"],
        "file_name": row["file_name"] or "",
        "messages": msgs,
        "chroma_index_name": (cix or "").strip() if cix else "",
    }


def get_all_sessions() -> list[dict]:
    """Newest activity first (``updated_at``, then ``id``)."""
    init_chat_db()
    with _chat_db_conn() as conn:
        cur = conn.execute(
            """
            SELECT session_id, created_at, file_name, updated_at
            FROM chat_sessions
            ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
            """
        )
        rows = cur.fetchall()
    return [
        {
            "session_id": r["session_id"],
            "created_at": r["created_at"] or "",
            "file_name": r["file_name"] or "",
            "updated_at": r["updated_at"] or r["created_at"] or "",
        }
        for r in rows
    ]


def delete_session(session_id: str) -> None:
    """Remove chat row and queue that session's Chroma folder for deletion (if any)."""
    init_chat_db()
    snap = load_session(session_id)
    if snap and snap.get("chroma_index_name"):
        p = DB_STORAGE_DIR / snap["chroma_index_name"]
        try:
            if p.is_dir() and p.name.startswith("index_"):
                queue_old_chroma_for_deletion(p.resolve())
        except OSError:
            pass
    with _chat_db_conn() as conn:
        conn.execute("DELETE FROM chat_sessions WHERE session_id = ?", (session_id,))
