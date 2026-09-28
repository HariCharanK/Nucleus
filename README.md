# 🧬 Nucleus

An agentic thought router for your personal knowledge base. Dump your thoughts in a chat, and Nucleus routes them to the right place in your markdown notes.

## Features

- **Chat-first** — everything happens through natural conversation
- **Agentic** — the AI explores your notes, edits files, and commits changes using bash and text editor tools
- **Proactive** — suggests restructuring, cross-linking, and organizational improvements
- **Self-learning** — maintains memory of your preferences in `.nucleus/memory.md`
- **Git-backed** — all changes are shown as diffs before committing

## Quick Start

```bash
# Clone the repo
git clone https://github.com/HariCharanK/nucleus.git
cd nucleus

# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY (or OPENAI_API_KEY) and NOTES_DIR

# Make sure your notes directory is a git repo
cd /path/to/your/notes && git init && git add -A && git commit -m "Initial commit"

# Run Nucleus
npm run dev
# Opens at http://localhost:5173
```

## Architecture

```
One npm run dev command → Vite (frontend) + Hono (backend)

Browser ←→ Hono server ←→ Claude (Vercel AI SDK) ←→ Your notes (local filesystem + git)
```

- **Frontend**: Vite + React + Tailwind — chat UI with inline diff viewer
- **Backend**: Hono server (~70 lines) — single `/api/chat` endpoint
- **LLM**: Claude via Vercel AI SDK — pluggable providers
- **Tools**: `bash` (shell commands) + `str_replace_based_edit_tool` (Anthropic's text editor)

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | (one key required) |
| `OPENAI_API_KEY` | Your OpenAI API key | (one key required) |
| `PROVIDER` | `anthropic` or `openai` | inferred from the key set (Anthropic if both) |
| `NOTES_DIR` | Absolute path to your notes directory | (required) |
| `MODEL` | Model to use | `claude-opus-4-6` / `gpt-5` |
| `PORT` | Server port | `3001` |

## How It Works

1. You type a thought in the chat
2. Nucleus explores your notes (via bash/text_editor tools)
3. It edits the right files and shows you the git diff
4. You say "looks good" → it commits. "Undo" → it reverts. Or give feedback → it adjusts.

The agent maintains its own memory at `.nucleus/memory.md` in your notes directory, learning your preferences over time.

## License

MIT
