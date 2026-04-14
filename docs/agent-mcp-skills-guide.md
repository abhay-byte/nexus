# Nexus MCP + Skills Guide

This guide explains:

- how Nexus shared MCP settings work
- which MCP servers Nexus can now add as presets
- which agent config files Nexus writes automatically
- how to install useful skills and workflows for the remaining CLI agents
- how to bootstrap GitHub Spec Kit in a project without overwriting an existing setup

## What Nexus now does

Shared MCP servers are configured in `Settings -> Agents & MCP -> MCP Server Registry`.

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

- MCP servers are configured once and applied to every registered project.
- Nexus preserves MCP entries it did not create.
- Nexus only adds, updates, or removes the server entries it manages.
- Nexus keeps `Aider` and custom agents manual for now.
- OpenCode and Cline use Nexus-managed config roots so Nexus does not overwrite a user's existing native config.
- Legacy per-project MCP entries are migrated into the shared registry automatically the first time the new flow loads.

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
  - Nexus stores `<PROJECT_PATH>` in the shared registry and resolves it to each project's root when syncing config files or launching agents.

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

Nexus writes or injects these integrations from the shared MCP registry:

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
- Launch behavior: Nexus injects project-resolved MCP entries at startup with repeated `-c mcp_servers.<name>...` arguments
- Important:
  - Codex also loads MCP servers from `~/.codex/config.toml`.
  - Nexus now skips injecting a Codex MCP server if the same server is already present in the user's home Codex config by name or matching `command + args`.
  - In `/mcp`, Nexus-managed entries are prefixed with `nexus_`. Non-prefixed entries usually come from the user's existing Codex config or Codex plugins.

### Codex Troubleshooting

- If `/mcp` shows both `context-mode` and `nexus_context_mode`, an older Nexus build injected a duplicate on top of the user's `~/.codex/config.toml`. The duplicate-skip fix removes that extra Nexus copy for future sessions.
- If `/mcp` shows a server like `unityMCP`, and that name is not prefixed with `nexus_`, it is not coming from Nexus. Check `~/.codex/config.toml`.
- If a Nexus-managed server appears but has `Tools: (none)`, Codex received the config but the server itself failed to initialize. Common causes are:
  - missing local dependency such as `docker`, `uvx`, or `npx`
  - missing required env vars such as `GITHUB_PERSONAL_ACCESS_TOKEN`
  - the backing local service is not running, for example `http://127.0.0.1:8080/mcp`
- The GitHub preset currently uses the local Docker-based GitHub MCP server. If Docker is unavailable or unhealthy, Codex will list the server name but startup will fail.
- The Android preset currently assumes `uvx` plus a working Android/ADB setup. Codex can list the server entry even when the underlying Android MCP process exits during startup.

## Manual MCP for the Remaining Built-In Agents

For these agents, Nexus stores the canonical server definition in the shared settings registry, but you still need to wire MCP manually:

- `Aider`
- custom agents added by the user

Practical workflow:

1. Add the server preset in `Settings -> Agents & MCP`.
2. Enable the agents that should use that server.
3. For the auto-wired agents above, Nexus writes or injects the config automatically for every registered project.
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

### Nexus one-click install

Nexus now exposes `Install Caveman` in `Settings -> Agents & MCP` for these agents:

- `Claude Code`
- `Gemini CLI`
- `Cline`
- `Kiro`

Nexus uses the upstream install command for each supported agent:

- `Claude Code`:
  - `claude plugin marketplace add JuliusBrussee/caveman`
  - `claude plugin install caveman@caveman`
- `Gemini CLI`:
  - `gemini extensions install https://github.com/JuliusBrussee/caveman`
- `Cline`:
  - `npx skills add JuliusBrussee/caveman -a cline`
- `Kiro`:
  - `npx skills add JuliusBrussee/caveman -a kiro-cli`

Important caveats:

- Nexus does not yet automate the Codex Caveman plugin flow because upstream requires installing it through Codex from a local Caveman clone.
- For agents installed through `npx skills add`, upstream notes that the skill file is installed but always-on rule files may still need manual setup if you want session-start activation everywhere.
- After a successful one-click install, Nexus persists a per-agent Caveman marker in its app settings so the `Agents & MCP` screen stays in sync across app restarts.

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
- it creates a real project-local `.specify/` directory with templates, prompts, and workflow scaffolding inside your project folder

Bootstrap command from upstream:

- `uvx --from git+https://github.com/github/spec-kit.git specify init . --ai claude`
- for an existing project:
  - `specify init --here --force --ai <agent>`

Core workflow from upstream:

1. `/speckit.constitution`
2. `/speckit.specify`
3. `/speckit.plan`
4. `/speckit.tasks`

Codex note from upstream:

- most agents use `/speckit.*`
- Codex CLI in skills mode uses `$speckit-*`

### Nexus one-click bootstrap

Nexus now exposes `Bootstrap Spec Kit` on each project in `Settings -> Projects`.

Supported target agents:

- `Codex CLI`
- `Claude Code`
- `Gemini CLI`

Nexus runs the upstream project bootstrap in the selected project directory:

- `uvx --from git+https://github.com/github/spec-kit.git specify init --here --force --ai <agent>`
- for `Codex CLI`, Nexus also enables Spec Kit AI skills with `--ai-skills`
- on Windows, Nexus uses Spec Kit's PowerShell script mode when bootstrapping from the desktop app

Behavior:

- if `.specify` already exists, Nexus skips the project
- if `.specify` is missing, Nexus initializes Spec Kit in-place
- Nexus persists the last successful bootstrap target in project settings and also treats the real project-local `.specify/` directory as the durable source of truth when reloading projects

Why Nexus does not hand-write those files itself:

- Spec Kit owns the generated file layout and templates upstream
- running upstream init keeps the project consistent with the current Spec Kit workflow instead of freezing an outdated Nexus copy

## Agency Agents

Repository: `https://github.com/msitarzewski/agency-agents`

What it is:

- a large catalog of specialist agent personas maintained upstream

### Nexus project install

Nexus now exposes an `Agency Agent` section in `Settings -> Projects`.

Flow:

1. Choose a specialist from the dropdown.
2. Toggle the feature on for the project.
3. Nexus writes:
   - `AGENCY.md`
   - `.nexus/agency-agents.json`

Important behavior:

- this is project-scoped, not global
- Nexus stores one selected upstream specialist per project
- the install is file-based and PowerShell-safe because Nexus copies the upstream Markdown directly instead of relying on upstream bash installers
- Nexus only overwrites `AGENCY.md` when that file was previously created by Nexus, so an existing manual project file is not clobbered
- the generated file is intended as project-local agent context for Nexus-managed workflows

Windows note:

- Nexus fetches the upstream repository with `git`; PowerShell itself is fine, but `git` must be available on PATH

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
- `Claude Code`: strong fit for `context-mode`, `context7`, `filesystem`, `playwright`, `github`, `Spec Kit`, and `Caveman`; Nexus writes `.mcp.json`
- `Gemini CLI`: strong fit for `context7`, `Spec Kit`, and `Caveman`; Nexus writes `.gemini/settings.json`
- `Qwen Code`: good fit for generic stdio MCP servers; Nexus writes `.qwen/settings.json`
- `Kilo Code`: good fit for generic stdio MCP servers; Nexus writes `.kilocode/mcp.json`
- `OpenCode`: good fit for generic stdio MCP servers; Nexus uses a managed `OPENCODE_CONFIG`
- `Cline`: usable with presets and Caveman; Nexus uses a managed `CLINE_DIR`
- `Aider`: manual-only today

## Windows / PowerShell Notes

- `Open Folder` now uses a native OS opener instead of shell-open from the frontend.
- `Spec Kit` bootstrap uses upstream PowerShell mode on Windows.
- PTY shell auto-detect now prefers `pwsh.exe`, then `powershell.exe`, then `cmd.exe`.
- `Agency Agent` project installs are file-based in Rust and do not depend on bash.
- `Caveman` one-click installs call the target executable directly (`claude`, `gemini`, `npx`) and are PowerShell-safe as long as those commands are on PATH.

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
