# Sources & Methodology

## How This Was Compiled

### Primary Sources

1. **[abhay-byte.github.io — AI Editors Comparison](https://abhay-byte.github.io/abhay-kb/AI-Tools/ai-editors.html)**
   - Comprehensive comparison of AI-integrated code editors (Cursor, Windsurf, VS Code, TRAE, Kiro, Antigravity, GitHub Copilot)
   - Includes pricing, models, features, pros/cons tables

2. **[abhay-byte.github.io — AI Coding Tools Comparison](https://abhay-byte.github.io/abhay-kb/AI-Tools/tools.html)**
   - Comprehensive comparison of terminal-based coding agents (OpenCode, Claude Code, Codex CLI, Gemini CLI, Aider, Qwen Code, Junie, Kilo Code, Cline, Continue, Goose, Amp)
   - Includes pricing, model support, install instructions

### Secondary Sources (Web Search)

- DuckDuckGo web search for:
  - Current ChatGPT free tier model details and limits
  - Claude.ai free plan model and message limits
  - Google Gemini free tier model availability
  - DeepSeek free web chat
  - Mistral Le Chat free offering
  - GitHub Copilot standalone free tier

> **Note:** DuckDuckGo hit rate limits during research. Standalone chatbot details (ChatGPT, Claude, Gemini, DeepSeek, Mistral) are supplemented from my training knowledge of their free tiers as of early 2025.

### Pages Attempted But Blocked

These official pages returned 403/404 (likely bot protection):
- `https://openai.com/chatgpt/pricing` — 403
- `https://claude.ai/pricing` — 403
- `https://chat.deepseek.com` — 403
- `https://help.openai.com/en/articles/9275245-using-chatgpt-s-free-tier` — 403
- `https://support.anthropic.com/en/articles/9766883-what-are-the-usage-limits-for-claude-ai` — 404

### Methodology

1. Fetched and indexed both reference pages using context-mode fetch
2. Searched indexed content with targeted queries for free tier, pricing, and model details
3. Attempted official pricing pages (blocked by bot protection)
4. Supplemented with training knowledge for standalone chatbot platforms
5. Created individual markdown files in `/docs/free/` for each tool

### Disclaimer

Free tier details (especially rate limits, model access, and quotas) change frequently. This is a snapshot as of **2026-05-23**. Always check the official pricing page for current information.

### Files Created

All files in `/docs/free/`:

| File | Tool |
|------|------|
| `index.md` | Master index + quick comparison table |
| `sources.md` | This file |
| `cursor.md` | Cursor |
| `windsurf.md` | Windsurf (Codeium) |
| `vscode-copilot.md` | VS Code + GitHub Copilot |
| `trae.md` | TRAE (ByteDance) |
| `antigravity.md` | Google Antigravity |
| `kiro.md` | Kiro (AWS) |
| `claude-code.md` | Claude Code (Anthropic) |
| `codex-cli.md` | Codex CLI (OpenAI) |
| `gemini-cli.md` | Gemini CLI (Google) |
| `aider.md` | Aider |
| `qwen-code.md` | Qwen Code (Alibaba) |
| `opencode.md` | OpenCode |
| `junie.md` | Junie CLI (JetBrains) |
| `kilo-code.md` | Kilo Code |
| `cline.md` | Cline |
| `continue.md` | Continue |
| `goose.md` | Goose (Block) |
| `amp.md` | Amp (Sourcegraph) |
| `chatgpt.md` | ChatGPT (OpenAI) |
| `claude-ai.md` | Claude.ai (Anthropic) |
| `gemini.md` | Google Gemini |
| `deepseek.md` | DeepSeek |
| `mistral.md` | Mistral Le Chat |
| `github-copilot.md` | GitHub Copilot (standalone) |
| `nexus.md` | Nexus Terminal |
