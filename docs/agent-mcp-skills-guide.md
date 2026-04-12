# Nexus MCP + Skills Guide

This guide explains:

- how Nexus project-level MCP settings work
- which MCP servers Nexus can now add as presets
- which agent config files Nexus writes automatically
- how to install useful skills and workflows for the remaining CLI agents
- how to bootstrap GitHub Spec Kit in a project without overwriting an existing setup

## What Nexus now does

Per-project MCP servers are configured in `Settings -> Agents & MCP -> Projects -> MCP Server Registry`.

Nexus now supports:

- one-click MCP server presets for:
  - `context-mode`
  - `context7`
  - `playwright`
  - `github`
  - `filesystem`
  - `sequential-thinking`
  - `android-mcp`
- project-local MCP file sync for:
  - `Kiro` -> `.kiro/settings/mcp.json`
  - `Junie` -> `.junie/mcp/mcp.json`
  - `Claude Code` -> `.mcp.json`
  - `Gemini CLI` -> `.gemini/settings.json`
  - `Qwen Code` -> `.qwen/settings.json`
  - `Kilo Code` -> `.kilocode/mcp.json`
  - `OpenCode` -> `.nexus/opencode/opencode.json` plus `OPENCODE_CONFIG` on launch
  - `Cline` -> `.nexus/cline/data/settings/cline_mcp_settings.json` plus `CLINE_DIR` on launch
- launch-time MCP injection for:
  - `Codex CLI` -> `codex -c mcp_servers...`
- managed-entry tracking in:
  - `.nexus/mcp-managed.json`

Important behavior:

- Nexus preserves MCP entries it did not create.
- Nexus only adds, updates, or removes the server entries it manages.
- Nexus keeps `Aider` and custom agents manual for now.
- OpenCode and Cline use Nexus-managed config roots so Nexus does not overwrite a user's existing native config.

## Preset Catalog

### context-mode

- Purpose: context-window protection, indexed output/search, routing tools.
- Nexus preset:
  - `command`: `context-mode`
  - `args`: none
- Prerequisite:
  - `npm install -g context-mode`
- Notes:
  - For Kiro, upstream also requires hooks plus a `KIRO.md` steering file for full enforcement.
  - For other agents, see upstream platform-specific install docs.

### context7

- Purpose: up-to-date library and API docs through MCP.
- Nexus preset:
  - `command`: `npx`
  - `args`: `-y @upstash/context7-mcp`
- Optional env:
  - `CONTEXT7_API_KEY`
- Notes:
  - Upstream also documents a hosted MCP endpoint at `https://mcp.context7.com/mcp`.
  - Nexus uses the command-based package because the current MCP model is stdio-oriented.

### playwright

- Purpose: browser automation, screenshots, DOM inspection, UI flow debugging.
- Nexus preset:
  - `command`: `npx`
  - `args`: `-y @playwright/mcp@latest`
- Notes:
  - Browsers may need separate Playwright installation depending on your machine and host.

### github

- Purpose: GitHub repository, issue, pull request, and code operations through GitHub's official MCP server.
- Nexus preset:
  - `command`: `docker`
  - `args`: `run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server`
- Required env:
  - `GITHUB_PERSONAL_ACCESS_TOKEN`
- Notes:
  - Upstream also supports a compiled `github-mcp-server stdio` binary if you do not want Docker.

### filesystem

- Purpose: filesystem access scoped to the current project root.
- Nexus preset:
  - `command`: `npx`
  - `args`: `-y @modelcontextprotocol/server-filesystem <PROJECT_PATH>`
- Notes:
  - Nexus automatically inserts the selected project path as the allowed directory.

### sequential-thinking

- Purpose: structured, reflective reasoning for complex problem solving.
- Nexus preset:
  - `command`: `npx`
  - `args`: `-y @modelcontextprotocol/server-sequential-thinking`

### android-mcp

- Purpose: control Android devices and emulators through ADB.
- Nexus preset:
  - `command`: `uvx`
  - `args`: `--python 3.13 android-mcp`
- Typical optional env:
  - `ANDROID_MCP_CONNECTION=wifi`
  - `ANDROID_MCP_HOST=<device-host>`
- Notes:
  - Requires ADB plus a connected emulator or device.

## Auto-Wired Agent Integrations

Nexus writes or injects these integrations from the per-project MCP registry:

### Kiro

- File: `.kiro/settings/mcp.json`
- Format: `{"mcpServers": { ... }}`
- Extra setup often still needed:
  - some servers need Kiro-specific hooks or steering files
  - `context-mode` is the main example

### Junie

- File: `.junie/mcp/mcp.json`
- Format: `{"mcpServers": { ... }}`

### Claude Code

- File: `.mcp.json`
- Format: `{"mcpServers": { ... }}`

### Gemini CLI

- File: `.gemini/settings.json`
- Key: `mcpServers`

### Qwen Code

- File: `.qwen/settings.json`
- Key: `mcpServers`

### Kilo Code

- File: `.kilocode/mcp.json`
- Format: `{"mcpServers": { ... }}`

### OpenCode

- File: `.nexus/opencode/opencode.json`
- Launch behavior: Nexus starts OpenCode with `OPENCODE_CONFIG` pointed at that file
- Key: `mcp`

### Cline

- File: `.nexus/cline/data/settings/cline_mcp_settings.json`
- Launch behavior: Nexus starts Cline with `CLINE_DIR` pointed at `.nexus/cline`
- Key: `mcpServers`

### Codex CLI

- File: none
- Launch behavior: Nexus injects per-project MCP entries at startup with repeated `-c mcp_servers.<name>...` arguments

## Manual MCP for the Remaining Built-In Agents

For these agents, Nexus stores the canonical server definition in project settings, but you still need to wire MCP manually:

- `Aider`
- custom agents added by the user

Practical workflow:

1. Add the server preset in Nexus for the project.
2. Enable the agents that should use that server.
3. For the auto-wired agents above, Nexus writes or injects the config automatically.
4. For manual agents, copy the server definition from Nexus into the agent's native MCP config file or settings UI.

## Skills and Agent Add-Ons

## Caveman

Repository: `https://github.com/JuliusBrussee/caveman`

What it is:

- a cross-agent skill/plugin for terse prompt compression and terse response style

Useful installs from upstream:

- generic skill install:
  - `npx skills add JuliusBrussee/caveman -a <agent>`
- Kiro-specific skill target:
  - `npx skills add JuliusBrussee/caveman -a kiro-cli`

Important caveat from upstream:

- `npx skills add` installs the skill file, but not every agent's always-on rule/hook file.
- For some agents, especially Kiro/Cline/Cursor/Windsurf/Copilot, you may need to add always-on instructions manually if you want automatic activation.

Codex note:

- upstream documents repo-local Codex hook usage and `$caveman` command syntax instead of `/caveman`

## Context7 as a Skill

Repository: `https://github.com/upstash/context7`

Fast setup:

- `npx ctx7 setup`

Upstream documents two modes:

- CLI + Skills
- MCP

This is useful for agents where you do not want to wire full MCP first. A simple always-on rule from upstream is:

- always use Context7 when library/API docs, setup steps, or configuration details are needed

## Context Mode for Kiro

Repository: `https://github.com/mksglu/context-mode`

Upstream Kiro install includes more than the MCP server entry:

1. install:
   - `npm install -g context-mode`
2. add `.kiro/settings/mcp.json`
3. add `.kiro/hooks/context-mode.json`
4. copy upstream `KIRO.md`

Nexus handles step 2 for Kiro when the preset is enabled.

You still need to do steps 3 and 4 if you want the full hook-enforced routing flow documented upstream.

## GitHub Spec Kit

Repository: `https://github.com/github/spec-kit`

What it is:

- a spec-driven development toolkit for agent workflows

Bootstrap command from upstream:

- `uvx --from git+https://github.com/github/spec-kit.git specify init . --ai claude`
- for an existing project:
  - `specify init --here --ai <agent>`

Core workflow from upstream:

1. `/speckit.constitution`
2. `/speckit.specify`
3. `/speckit.plan`
4. `/speckit.tasks`

Codex note from upstream:

- most agents use `/speckit.*`
- Codex CLI in skills mode uses `$speckit-*`

### Nexus helper script

Nexus now ships:

- [bootstrap-spec-kit.sh](/home/abhay/repos/nexus/scripts/bootstrap-spec-kit.sh)

Usage:

```bash
scripts/bootstrap-spec-kit.sh --ai codex /absolute/project/path
scripts/bootstrap-spec-kit.sh --ai claude /absolute/project/path-1 /absolute/project/path-2
```

Behavior:

- if `.specify` already exists, the project is skipped
- if `.specify` is missing, the script runs Spec Kit init in-place

## Android MCP Device Checklist

Before enabling `android-mcp`, verify:

```bash
adb devices
```

If the device is not listed or is `unauthorized`, fix USB debugging or Wi-Fi ADB first.

## Recommended Agent Pairings

- `Kiro`: strongest current Nexus auto-sync story for MCP
- `Junie`: also auto-synced by Nexus
- `Codex CLI`: good fit for `filesystem`, `context7`, `github`, `playwright`, and `Spec Kit`; Nexus injects MCP on launch
- `Claude Code`: strong fit for `context-mode`, `context7`, `filesystem`, `playwright`, `github`, and `Spec Kit`; Nexus writes `.mcp.json`
- `Gemini CLI`: strong fit for `context7`, `Spec Kit`, and `Caveman`; Nexus writes `.gemini/settings.json`
- `Qwen Code`: good fit for generic stdio MCP servers; Nexus writes `.qwen/settings.json`
- `Kilo Code`: good fit for generic stdio MCP servers; Nexus writes `.kilocode/mcp.json`
- `OpenCode`: good fit for generic stdio MCP servers; Nexus uses a managed `OPENCODE_CONFIG`
- `Cline`: usable with presets; Nexus uses a managed `CLINE_DIR`
- `Aider`: manual-only today

## Sources

- JuliusBrussee Caveman: `https://github.com/JuliusBrussee/caveman`
- context-mode: `https://github.com/mksglu/context-mode`
- Context7: `https://github.com/upstash/context7`
- Android MCP: `https://github.com/CursorTouch/Android-MCP`
- Playwright MCP: `https://github.com/microsoft/playwright-mcp`
- GitHub MCP Server: `https://github.com/github/github-mcp-server`
- MCP Filesystem Server: `https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem`
- MCP Sequential Thinking Server: `https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking`
- GitHub Spec Kit: `https://github.com/github/spec-kit`
- GitHub blog post on Spec Kit: `https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/`
