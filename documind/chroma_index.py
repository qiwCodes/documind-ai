"""Chroma persistence, PDF loading, embeddings, and index lifecycle."""

from __future__ import annotations

import gc
import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path

import streamlit as st

# Chroma's OpenTelemetry dependency can load older generated protobuf modules.
# Force python protobuf runtime to avoid "Descriptors cannot be created directly"
# crashes with newer protobuf wheels in hosted environments.
os.environ.setdefault("PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION", "python")
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from documind.config import DB_STORAGE_DIR, EMBED_MODEL, PENDING_CHROMA_DELETE


def get_embeddings() -> HuggingFaceEmbeddings:
    if st.session_state.embeddings is None:
        st.session_state.embeddings = HuggingFaceEmbeddings(
            model_name=EMBED_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return st.session_state.embeddings


def file_signature(uploaded_files) -> tuple | None:
    if not uploaded_files:
        return None
    return tuple(sorted((f.name, f.size) for f in uploaded_files))


def chroma_doc_count(persist_path: Path) -> int:
    if not persist_path.is_dir():
        return 0
    try:
        import chromadb

        client = chromadb.PersistentClient(path=str(persist_path))
        total = 0
        for col in client.list_collections():
            total += col.count()
        return total
    except Exception:
        return 0


def _append_pending_chroma_delete(path: Path) -> None:
    DB_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    line = f"{path.resolve()}\n"
    with open(PENDING_CHROMA_DELETE, "a", encoding="utf-8") as f:
        f.write(line)


def process_pending_chroma_deletes() -> None:
    """Try to remove old index folders (Windows-safe: runs when nothing holds the files)."""
    if not PENDING_CHROMA_DELETE.exists():
        return
    raw = PENDING_CHROMA_DELETE.read_text(encoding="utf-8")
    paths = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    PENDING_CHROMA_DELETE.unlink(missing_ok=True)
    failed: list[str] = []
    for line in paths:
        p = Path(line)
        try:
            if p.exists():
                shutil.rmtree(p)
        except OSError:
            failed.append(line)
    if failed:
        with open(PENDING_CHROMA_DELETE, "w", encoding="utf-8") as f:
            f.write("\n".join(failed) + "\n")


def _legacy_uuid_subdirs(root: Path) -> list[Path]:
    """Chroma legacy layout: ``db_storage/<uuid>/...`` when persist_directory was the root."""
    out: list[Path] = []
    if not root.is_dir():
        return out
    for p in root.iterdir():
        if p.is_dir() and len(p.name) == 36 and p.name.count("-") == 4:
            try:
                uuid.UUID(p.name)
                out.append(p)
            except ValueError:
                pass
    return out


def queue_old_chroma_for_deletion(prev: Path | None) -> None:
    """Schedule previous store for deletion after handles are released (never delete in-use tree)."""
    if prev is None:
        return
    try:
        prev = prev.resolve()
    except OSError:
        return
    db_r = DB_STORAGE_DIR.resolve()
    if prev.name.startswith("index_") and prev.is_dir():
        _append_pending_chroma_delete(prev)
        return
    if prev == db_r:
        for sub in _legacy_uuid_subdirs(DB_STORAGE_DIR):
            _append_pending_chroma_delete(sub)


def release_vectorstore_for_rebuild() -> None:
    """Drop Chroma references so Windows can release file locks."""
    st.session_state.vectorstore = None
    st.session_state.pop("doc_overview_excerpt", None)
    gc.collect()
    time.sleep(0.35)


def load_pdf_documents(uploaded_files) -> list:
    """Read uploaded PDFs from temp files and attach source_file metadata."""
    docs = []
    for uploaded in uploaded_files:
        suffix = Path(uploaded.name).suffix.lower() or ".pdf"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(uploaded.getvalue())
            tmp_path = tmp.name
        try:
            loader = PyPDFLoader(tmp_path)
            for d in loader.load():
                d.metadata.setdefault("source_file", uploaded.name)
                docs.append(d)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    return docs


def _save_original_pdfs_to_index(index_dir: Path, uploaded_files) -> None:
    """Copy uploaded PDF bytes next to Chroma so each index folder is self-contained and archivable."""
    orig_dir = index_dir / "original_pdfs"
    orig_dir.mkdir(parents=True, exist_ok=True)
    saved: list[dict[str, str]] = []
    for uf in uploaded_files:
        base = Path(uf.name).name or "document.pdf"
        dest = orig_dir / base
        if dest.exists():
            dest = orig_dir / f"{dest.stem}_{uuid.uuid4().hex[:8]}{dest.suffix}"
        try:
            dest.write_bytes(uf.getvalue())
            saved.append({"stored_as": dest.name, "original_name": uf.name})
        except OSError:
            continue
    try:
        (index_dir / "original_manifest.json").write_text(
            json.dumps(saved, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass


def process_pdf(uploaded_files) -> Chroma | None:
    """
    Chunk + embed PDFs and persist a new Chroma index under ./db_storage.
    Replaces this **chat session's** index only; schedules the previous session index for deletion.
    """
    st.session_state.index_error = None
    prev_raw = st.session_state.get("chroma_persist_path")
    prev_path = Path(prev_raw) if prev_raw else None

    release_vectorstore_for_rebuild()

    documents = load_pdf_documents(uploaded_files)
    if not documents:
        st.session_state.index_error = "No text could be extracted from the PDF(s)."
        st.session_state.pop("doc_overview_excerpt", None)
        return None

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=200,
        add_start_index=True,
    )
    chunks = splitter.split_documents(documents)

    # High-level excerpt from the start of the PDF(s) for every answer turn (reduces false negatives).
    overview_parts: list[str] = []
    for d in documents[:10]:
        t = (d.page_content or "").strip()
        if t:
            overview_parts.append(t[:450])
    overview = "\n\n".join(overview_parts)[:3200].strip()
    if overview:
        st.session_state["doc_overview_excerpt"] = overview
    else:
        st.session_state.pop("doc_overview_excerpt", None)

    DB_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    index_dir = DB_STORAGE_DIR / f"index_{uuid.uuid4().hex}"
    index_dir.mkdir(parents=True, exist_ok=True)
    _save_original_pdfs_to_index(index_dir, uploaded_files)

    embeddings = get_embeddings()
    vs = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(index_dir),
        collection_name="documind",
    )
    st.session_state.chroma_persist_path = str(index_dir)
    st.session_state.session_chroma_index_name = index_dir.name

    try:
        if prev_path and prev_path.resolve() != index_dir.resolve():
            queue_old_chroma_for_deletion(prev_path)
        process_pending_chroma_deletes()
    except OSError:
        pass
    return vs


def get_vector_store() -> Chroma | None:
    """
    Return this **chat session's** Chroma store only (folder name in ``session_chroma_index_name``).
    Does not fall back to other chats' indexes.
    """
    name = (st.session_state.get("session_chroma_index_name") or "").strip()
    if not name:
        st.session_state.vectorstore = None
        return None
    p = DB_STORAGE_DIR / name
    if not p.is_dir() or chroma_doc_count(p) == 0:
        st.session_state.vectorstore = None
        return None
    cached_vs = st.session_state.vectorstore
    cached_pp = st.session_state.get("chroma_persist_path")
    if cached_vs is not None and cached_pp:
        try:
            if Path(cached_pp).resolve() == p.resolve():
                return cached_vs
        except OSError:
            pass
        st.session_state.vectorstore = None
    try:
        vs = Chroma(
            persist_directory=str(p),
            embedding_function=get_embeddings(),
            collection_name="documind",
        )
        st.session_state.chroma_persist_path = str(p.resolve())
        st.session_state.vectorstore = vs
        return vs
    except Exception:
        return None
