# DocuMind AI

DocuMind AI is a Streamlit-based PDF question answering app that combines Groq chat models, local Hugging Face embeddings, and ChromaDB persistence. Upload one or more PDFs, ask follow-up questions in Thai or English, and keep each chat thread tied to its own saved document index.

## Features

- Upload and index one or more PDF files per chat session
- Ask multi-turn questions with conversation-aware retrieval
- Persist each chat's Chroma index and original uploaded PDFs locally
- Reopen previous conversations without re-uploading documents
- Show supporting source snippets with similarity scores
- Handle Thai text cleanup and citation formatting for readable answers

## Tech Stack

- Python
- Streamlit
- LangChain
- Groq API for chat generation
- Hugging Face sentence-transformers for embeddings
- ChromaDB for local vector storage
- SQLite for chat session history

## Project Structure

```text
.
|-- app.py
|-- requirements.txt
|-- .streamlit/
|   `-- config.toml
`-- documind/
    |-- chat_db.py
    |-- chroma_index.py
    |-- config.py
    |-- rag.py
    |-- session.py
    |-- text_thai.py
    `-- ui.py
```

## Requirements

- Python 3.11+ recommended
- A valid `GROQ_API_KEY`

## Local Setup

1. Create and activate a virtual environment.
2. Install dependencies.
3. Create a local environment file from the example.
4. Start the Streamlit app.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python -m streamlit run app.py
```

Then edit `.env` and set:

```env
GROQ_API_KEY=your_groq_api_key
```

## How It Works

1. Upload PDFs in the sidebar.
2. The app extracts text, splits documents into chunks, and stores embeddings in a per-chat Chroma index under `db_storage/`.
3. Each question is rewritten for better retrieval, relevant chunks are fetched, and Groq generates an answer grounded in those excerpts.
4. Previous chat sessions remain available in SQLite and can be reopened from the sidebar.

## Configuration

Environment variables supported by the app:

- `GROQ_API_KEY`: required for chat generation
- `DOCUMIND_STORAGE_DIR`: optional override for where local chat history and Chroma indexes are stored
- `GROQ_MODEL`: optional override for the main answer model
- `GROQ_REWRITE_MODEL`: optional override for the query rewrite model
- `GROQ_ANSWER_FALLBACK_MODEL`: optional fallback when the main answer model is rate limited

The default UI/theme and Streamlit server behavior live in `.streamlit/config.toml`.

## Deploy on Render

This repository includes a ready-to-use `render.yaml` for Render Blueprint deployment.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/qiwCodes/documind-ai)

Render configuration:

- Build command: `pip install -r requirements.txt`
- Start command: `streamlit run app.py --server.address 0.0.0.0 --server.port $PORT`
- Required secret: `GROQ_API_KEY`
- Default plan in `render.yaml`: `free`

Deployment notes:

- Free Render web services use an ephemeral filesystem, so saved chat history, uploaded PDF copies, and Chroma indexes are lost after redeploys, restarts, or idle spin-down.
- If you need persistent conversations and document indexes, upgrade to a paid web service and attach a persistent disk, then set `DOCUMIND_STORAGE_DIR` to a path on that disk.

## Notes

- Local chat history and vector indexes are intentionally excluded from git via `.gitignore`.
- Uploaded PDFs are copied into each chat's saved index folder so a conversation can be reopened without uploading the files again.
- For deployment on Streamlit Cloud, set `GROQ_API_KEY` in Streamlit Secrets instead of using a local `.env` file.

## Run Checklist

```bash
python -m compileall app.py documind
python -m streamlit run app.py
```

If the app starts but answers fail, verify the API key and Groq model availability first.
