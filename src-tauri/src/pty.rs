use crate::state::{AppState, PtySession};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    thread,
};
use tauri::{AppHandle, Emitter, State};
use which::which;

const CAVEMAN_REPO: &str = "https://github.com/JuliusBrussee/caveman";
const SPEC_KIT_REPO: &str = "git+https://github.com/github/spec-kit.git";
const AGENCY_AGENTS_REPO: &str = "https://github.com/msitarzewski/agency-agents.git";
const AGENCY_AGENT_DEST_RELATIVE_PATH: &str = "AGENCY.md";
const AGENCY_AGENT_MANIFEST_RELATIVE_PATH: &str = ".nexus/agency-agents.json";
const LEGACY_AGENCY_AGENT_DEST_RELATIVE_PATH: &str = ".nexus/agency-agent.md";
const NEXUS_MANAGED_AGENCY_MARKER: &str = "<!-- Nexus-managed agency agent.";

#[derive(Serialize)]
pub struct AgencyAgentOption {
    slug: String,
    name: String,
    category: String,
}

fn shell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn powershell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Called once at startup, before the Tauri builder runs.
///
/// Two problems this fixes:
///
/// 1. **Sandboxed HOME / XDG vars** — editors like VS Code / Antigravity launch child
///    processes with `$HOME` and `$XDG_CONFIG_HOME` pointing to their own data
///    directories. Agents store auth tokens (codex: `~/.codex/auth.json`,
///    claude: `~/.claude/`, gemini: `~/.config/gemini/`) under the *real* user home.
///    We read the correct home from the OS passwd database via `getpwuid_r` and
///    override the sandboxed values on the current process so every spawned PTY
///    inherits the right paths.
///
/// 2. **Missing PATH entries** — when Nexus is launched from a desktop entry / app
///    launcher (not a terminal), the shell init files (`~/.bashrc`, `~/.zshrc`) are
///    never sourced, so tools installed via nvm, fnm, rustup, pipx etc. won't be on
///    PATH and agents won't be found. We fix this by spawning a login shell briefly
///    and extracting the PATH it produces.
#[cfg(unix)]
pub fn fix_home_env() {
    use std::ffi::CStr;

    // ── Step 1: fix HOME from passwd ──────────────────────────────────────────
    let uid = unsafe { libc::getuid() };
    let mut pwd = unsafe { std::mem::zeroed::<libc::passwd>() };
    let mut buf = vec![0i8; 4096];
    let mut result: *mut libc::passwd = std::ptr::null_mut();

    let rc = unsafe {
        libc::getpwuid_r(uid, &mut pwd, buf.as_mut_ptr(), buf.len(), &mut result)
    };

    let real_home: Option<String> = if rc == 0 && !result.is_null() {
        let h = unsafe { CStr::from_ptr(pwd.pw_dir) }
            .to_string_lossy()
            .into_owned();
        Some(h)
    } else {
        None
    };

    if let Some(ref real_home) = real_home {
        let env_home = std::env::var("HOME").unwrap_or_default();
        if env_home != *real_home {
            eprintln!(
                "[nexus] fixing HOME: '{}' → '{}'",
                env_home, real_home
            );
            std::env::set_var("HOME", real_home);

            // Reset XDG vars that are derived from HOME, but only if they
            // currently point outside the real home (i.e. they're sandboxed).
            let fix_xdg = |var: &str, suffix: &str| {
                let cur = std::env::var(var).unwrap_or_default();
                if !cur.starts_with(real_home.as_str()) {
                    std::env::set_var(var, format!("{real_home}/{suffix}"));
                }
            };
            fix_xdg("XDG_CONFIG_HOME", ".config");
            fix_xdg("XDG_DATA_HOME",   ".local/share");
            fix_xdg("XDG_CACHE_HOME",  ".cache");
            fix_xdg("XDG_STATE_HOME",  ".local/state");
        }
    }

    // ── Step 2: source login shell PATH ──────────────────────────────────────
    // Spawn `<shell> --login -c 'printf "%s" "$PATH"'` to get the PATH that a
    // fresh login shell would have. This picks up nvm, fnm, rustup, pyenv, etc.
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let output = std::process::Command::new(&shell)
        .args(["--login", "-c", "printf '%s' \"$PATH\""])
        .env("HOME", real_home.as_deref().unwrap_or("/root"))
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let login_path = String::from_utf8_lossy(&out.stdout);
            if !login_path.is_empty() {
                // Merge: login_path first (so user bins take priority), then
                // append anything from the current PATH not already covered.
                let cur_path = std::env::var("PATH").unwrap_or_default();
                let mut parts: Vec<&str> = login_path.split(':').collect();
                for segment in cur_path.split(':') {
                    if !segment.is_empty() && !parts.contains(&segment) {
                        parts.push(segment);
                    }
                }
                let merged = parts.join(":");
                std::env::set_var("PATH", &merged);
            }
        }
    }

    // ── Step 3: unconditionally prepend well-known user bin dirs ─────────────
    // Even if the login shell command failed (step 2), ensure ~/.local/bin,
    // ~/.cargo/bin etc. from the *real* home are always on PATH so tools like
    // kiro-cli, claude, aider, etc. are discoverable without needing the full
    // login-shell PATH expansion to succeed.
    let h = real_home.as_deref().unwrap_or("");
    if !h.is_empty() {
        let user_bins = [
            format!("{h}/.local/bin"),
            format!("{h}/.cargo/bin"),
            format!("{h}/.npm-global/bin"),
            format!("{h}/.yarn/bin"),
            format!("{h}/.bun/bin"),
            format!("{h}/go/bin"),
            format!("{h}/.go/bin"),
        ];
        let cur = std::env::var("PATH").unwrap_or_default();
        let existing: Vec<&str> = cur.split(':').collect();
        let mut prepend: Vec<String> = user_bins
            .iter()
            .filter(|d| !existing.contains(&d.as_str()) && std::path::Path::new(d.as_str()).exists())
            .cloned()
            .collect();
        if !prepend.is_empty() {
            prepend.push(cur);
            std::env::set_var("PATH", prepend.join(":"));
        }
    }
}

#[cfg(not(unix))]
pub fn fix_home_env() {
    // No-op on Windows; HOME / XDG not used, PATH already correct via installer.
}

#[derive(Serialize)]
pub struct InstalledAgentStatus {
    pub id: String,
    pub command: String,
    pub installed: bool,
}

#[derive(Serialize)]
pub struct RuntimeInfo {
    pub shell: String,
    pub os: String,
}

#[derive(Serialize, Clone)]
pub struct SystemHealth {
    pub cpu: f32,
    pub ram_used: f64,
    pub ram_total: f64,
}

#[tauri::command]
pub fn system_health(state: State<'_, AppState>) -> SystemHealth {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu = sys.global_cpu_usage();
    let ram_used = sys.used_memory() as f64 / 1_073_741_824.0;
    let ram_total = sys.total_memory() as f64 / 1_073_741_824.0;

    SystemHealth {
        cpu,
        ram_used,
        ram_total,
    }
}

fn default_shell(shell_override: Option<String>) -> String {
    if let Some(shell) = shell_override.filter(|value| !value.trim().is_empty()) {
        return shell;
    }

    if cfg!(target_os = "windows") {
        if which("pwsh.exe").is_ok() {
            "pwsh.exe".to_string()
        } else if which("powershell.exe").is_ok() {
            "powershell.exe".to_string()
        } else {
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        }
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn shell_wrap_command(shell: &str, command: &str, args: &[String]) -> (String, Vec<String>) {
    let shell_name = Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(shell)
        .to_ascii_lowercase();

    if shell_name == "pwsh" || shell_name == "pwsh.exe" || shell_name == "powershell" || shell_name == "powershell.exe" {
        let mut script_parts = Vec::with_capacity(args.len() + 2);
        script_parts.push("&".to_string());
        script_parts.push(powershell_escape(command));
        for arg in args {
            script_parts.push(powershell_escape(arg));
        }
        (
            shell.to_string(),
            vec![
                "-NoLogo".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                script_parts.join(" "),
            ],
        )
    } else if shell_name == "cmd" || shell_name == "cmd.exe" {
        let mut parts = Vec::with_capacity(args.len() + 1);
        parts.push(format!("\"{}\"", command.replace('"', "\"\"")));
        for arg in args {
            parts.push(format!("\"{}\"", arg.replace('"', "\"\"")));
        }
        (shell.to_string(), vec!["/C".to_string(), parts.join(" ")])
    } else {
        let mut parts = Vec::with_capacity(args.len() + 1);
        parts.push(shell_escape(command));
        for arg in args {
            parts.push(shell_escape(arg));
        }
        (shell.to_string(), vec!["-lc".to_string(), parts.join(" ")])
    }
}

#[tauri::command]
pub fn runtime_info(shell_override: Option<String>) -> RuntimeInfo {
    RuntimeInfo {
        shell: default_shell(shell_override)
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("shell")
            .to_string(),
        os: std::env::consts::OS.to_string(),
    }
}

#[tauri::command]
pub fn detect_installed_agents(candidates: Vec<(String, String)>) -> Vec<InstalledAgentStatus> {
    // Resolve the *real* user home directory via the OS passwd database.
    // This is the same technique used by fix_home_env() and is necessary because
    // editors / launchers (VS Code, Antigravity) override $HOME to a sandboxed path.
    // We do it independently here so this command is correct even if called before
    // the env has been fixed in a given build variant.
    #[cfg(unix)]
    let real_home: String = {
        use std::ffi::CStr;
        let uid = unsafe { libc::getuid() };
        let mut pwd = unsafe { std::mem::zeroed::<libc::passwd>() };
        let mut buf = vec![0i8; 4096];
        let mut result: *mut libc::passwd = std::ptr::null_mut();
        let rc = unsafe {
            libc::getpwuid_r(uid, &mut pwd, buf.as_mut_ptr(), buf.len(), &mut result)
        };
        if rc == 0 && !result.is_null() {
            unsafe { CStr::from_ptr(pwd.pw_dir) }
                .to_string_lossy()
                .into_owned()
        } else {
            // Fall back to $HOME env var if passwd lookup fails.
            std::env::var("HOME").unwrap_or_default()
        }
    };

    #[cfg(not(unix))]
    let real_home: String = std::env::var("HOME").unwrap_or_default();

    // Build a comprehensive list of directories to check beyond the current PATH.
    // Covers common installation targets: pipx, npm-global, yarn, cargo, go, bun,
    // fnm/nvm wrappers, kiro-cli, snap, and standard system paths.
    let h = &real_home;
    let extra_dir_strs: &[&str] = &[
        // User-local bins (real home)
        "/home/abhay/.local/bin", // hard-coded fallback in case passwd also fails
        "/usr/local/bin",
        "/usr/bin",
        "/snap/bin",
    ];
    let home_relative: Vec<String> = vec![
        format!("{h}/.local/bin"),
        format!("{h}/.local/share/kiro-cli/bin"),
        format!("{h}/.npm-global/bin"),
        format!("{h}/.yarn/bin"),
        format!("{h}/.cargo/bin"),
        format!("{h}/.go/bin"),
        format!("{h}/go/bin"),
        format!("{h}/.bun/bin"),
        format!("{h}/.fnm"),
        format!("{h}/.nvm/versions/node"),
    ];

    let mut extra_dirs: Vec<std::path::PathBuf> = home_relative
        .iter()
        .map(|s| std::path::PathBuf::from(s))
        .collect();

    // Also include PATH directories from the current process environment
    // (these were expanded by fix_home_env at startup).
    if let Ok(path_env) = std::env::var("PATH") {
        for segment in path_env.split(':') {
            if !segment.is_empty() {
                extra_dirs.push(std::path::PathBuf::from(segment));
            }
        }
    }

    // Append hard-coded system dirs last.
    for s in extra_dir_strs {
        extra_dirs.push(std::path::PathBuf::from(s));
    }

    candidates
        .into_iter()
        .map(|(id, command)| {
            // Prefer the standard `which` lookup (respects current PATH).
            let installed = if which(&command).is_ok() {
                true
            } else {
                // Exhaustive fallback: walk all candidate dirs.
                extra_dirs.iter().any(|dir| {
                    let full = dir.join(&command);
                    // exists() follows symlinks; we accept any existing file-system
                    // entry (file OR symlink to binary) that resolves successfully.
                    full.exists()
                })
            };
            InstalledAgentStatus { id, command, installed }
        })
        .collect()
}

#[tauri::command]
pub async fn spawn_pty(
    session_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    env: HashMap<String, String>,
    cols: u16,
    rows: u16,
    shell_override: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let is_qwen = command == "qwen";
    let chosen_shell = default_shell(shell_override.clone());
    if is_qwen {
        eprintln!(
            "[nexus:qwen] spawn cwd='{}' cols={} rows={} shell_override='{}' TERM='{}' COLORTERM='{}' LANG='{}'",
            cwd,
            cols,
            rows,
            shell_override.clone().unwrap_or_default(),
            std::env::var("TERM").unwrap_or_default(),
            std::env::var("COLORTERM").unwrap_or_default(),
            std::env::var("LANG").unwrap_or_default(),
        );
    }
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let (spawn_command, spawn_args) = if command.trim().is_empty() {
        (chosen_shell.clone(), Vec::new())
    } else if is_qwen {
        shell_wrap_command(&chosen_shell, &command, &args)
    } else {
        (command, args)
    };

    let mut builder = CommandBuilder::new(spawn_command);

    if !cwd.trim().is_empty() {
        builder.cwd(cwd);
    }

    for arg in spawn_args {
        builder.arg(arg);
    }

    // Inherit the full parent process environment (PATH, API keys, HOME, XDG vars, etc.).
    // By this point main() has already called fix_home_env() so std::env::vars() will
    // have the corrected HOME / XDG_CONFIG_HOME / XDG_DATA_HOME etc.
    for (key, value) in std::env::vars() {
        builder.env(key, value);
    }

    // --- Core terminal env --------------------------------------------------
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    builder.env("LANG",
        std::env::var("LANG").unwrap_or_else(|_| "en_US.UTF-8".to_string()));

    if is_qwen {
        eprintln!(
            "[nexus:qwen] builder TERM='xterm-256color' COLORTERM='truecolor' HOME='{}' XDG_CONFIG_HOME='{}'",
            std::env::var("HOME").unwrap_or_default(),
            std::env::var("XDG_CONFIG_HOME").unwrap_or_default(),
        );
    }

    // --- Force correct HOME / XDG vars into every PTY child ----------------
    // Re-assert these so nothing from the frontend env HashMap can override them
    // back to a sandboxed path.
    let real_home = std::env::var("HOME").unwrap_or_default();
    if !real_home.is_empty() {
        builder.env("HOME", &real_home);

        // Rebuild XDG defaults relative to real HOME (fall back to defaults if missing
        // or if the current value points outside the real home i.e. sandboxed).
        let xdg_config = std::env::var("XDG_CONFIG_HOME").ok()
            .filter(|v| v.starts_with(&real_home))
            .unwrap_or_else(|| format!("{real_home}/.config"));
        let xdg_data = std::env::var("XDG_DATA_HOME").ok()
            .filter(|v| v.starts_with(&real_home))
            .unwrap_or_else(|| format!("{real_home}/.local/share"));
        let xdg_cache = std::env::var("XDG_CACHE_HOME").ok()
            .filter(|v| v.starts_with(&real_home))
            .unwrap_or_else(|| format!("{real_home}/.cache"));
        let xdg_state = std::env::var("XDG_STATE_HOME").ok()
            .filter(|v| v.starts_with(&real_home))
            .unwrap_or_else(|| format!("{real_home}/.local/state"));

        builder.env("XDG_CONFIG_HOME", xdg_config);
        builder.env("XDG_DATA_HOME",   xdg_data);
        builder.env("XDG_CACHE_HOME",  xdg_cache);
        builder.env("XDG_STATE_HOME",  xdg_state);
    }
    // -----------------------------------------------------------------------

    // Apply any additional env overrides from the frontend (user-configured per-agent env).
    for (key, value) in env {
        builder.env(key, value);
    }

    let reader_session_id = session_id.clone();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair.master.take_writer().map_err(|error| error.to_string())?;
    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|error| error.to_string())?;

    let session = Arc::new(PtySession::new(writer, pair.master, child));
    {
        let mut sessions = state.sessions.lock().map_err(|error| error.to_string())?;
        sessions.insert(session_id.clone(), Arc::clone(&session));
    }

    let app_handle = app.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let _ = app_handle.emit(format!("pty-exit:{reader_session_id}").as_str(), ());
                    break;
                }
                Ok(size) => {
                    let payload = buffer[..size].to_vec();
                    let _ = app_handle.emit(
                        format!("pty-output:{reader_session_id}").as_str(),
                        payload,
                    );
                }
                Err(_) => {
                    let _ = app_handle.emit(format!("pty-exit:{reader_session_id}").as_str(), ());
                    break;
                }
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub fn write_pty(
    session_id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|error| error.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("No PTY session found for {session_id}"))?;
    let mut writer = session.writer.lock().map_err(|error| error.to_string())?;

    writer.write_all(&data).map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_pty(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|error| error.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("No PTY session found for {session_id}"))?;
    let master = session.master.lock().map_err(|error| error.to_string())?;

    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn kill_pty(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock().map_err(|error| error.to_string())?;
        sessions.remove(&session_id)
    };

    let Some(session) = session else {
        return Ok(());
    };

    let mut child = session.child.lock().map_err(|error| error.to_string())?;
    child.kill().map_err(|error| error.to_string())
}

// ─── Git diff structures ────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct GitDiffLine {
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub kind: String, // "context" | "added" | "removed"
    pub content: String,
}

#[derive(Serialize, Clone)]
pub struct GitDiffHunk {
    pub header: String,
    pub lines: Vec<GitDiffLine>,
}

#[derive(Serialize, Clone)]
pub struct GitChangedFile {
    pub path: String,
    pub status: String, // "modified" | "added" | "deleted" | "renamed"
    pub additions: i32,
    pub deletions: i32,
    pub hunks: Vec<GitDiffHunk>,
}

#[derive(Serialize, Clone)]
pub struct GitDiffResult {
    pub branch: String,
    pub files: Vec<GitChangedFile>,
    pub total_additions: i32,
    pub total_deletions: i32,
}

/// Parse `git diff --numstat` line: "<add>\t<del>\t<file>"
fn parse_numstat(line: &str) -> Option<(String, i32, i32)> {
    let parts: Vec<&str> = line.splitn(3, '\t').collect();
    if parts.len() < 3 {
        return None;
    }
    let add = parts[0].trim().parse::<i32>().unwrap_or(0);
    let del = parts[1].trim().parse::<i32>().unwrap_or(0);
    let file = parts[2].trim().to_string();
    Some((file, add, del))
}

/// Parse unified diff output into hunks
fn parse_unified_diff(diff_text: &str) -> Vec<GitDiffHunk> {
    let mut hunks: Vec<GitDiffHunk> = Vec::new();
    let mut current_hunk: Option<GitDiffHunk> = None;
    let mut old_line: u32 = 1;
    let mut new_line: u32 = 1;

    for line in diff_text.lines() {
        if line.starts_with("@@") {
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            // Parse @@ -old_start,old_count +new_start,new_count @@ ...
            let parts: Vec<&str> = line.splitn(5, ' ').collect();
            if parts.len() >= 3 {
                let old_info = parts[1].trim_start_matches('-');
                let new_info = parts[2].trim_start_matches('+');
                old_line = old_info.split(',').next().unwrap_or("1").parse().unwrap_or(1);
                new_line = new_info.split(',').next().unwrap_or("1").parse().unwrap_or(1);
            }
            current_hunk = Some(GitDiffHunk {
                header: line.to_string(),
                lines: Vec::new(),
            });
        } else if let Some(ref mut hunk) = current_hunk {
            if line.starts_with('-') && !line.starts_with("---") {
                hunk.lines.push(GitDiffLine {
                    old_line: Some(old_line),
                    new_line: None,
                    kind: "removed".to_string(),
                    content: line[1..].to_string(),
                });
                old_line += 1;
            } else if line.starts_with('+') && !line.starts_with("+++") {
                hunk.lines.push(GitDiffLine {
                    old_line: None,
                    new_line: Some(new_line),
                    kind: "added".to_string(),
                    content: line[1..].to_string(),
                });
                new_line += 1;
            } else if !line.starts_with("---") && !line.starts_with("+++") {
                hunk.lines.push(GitDiffLine {
                    old_line: Some(old_line),
                    new_line: Some(new_line),
                    kind: "context".to_string(),
                    content: if line.starts_with(' ') { line[1..].to_string() } else { line.to_string() },
                });
                old_line += 1;
                new_line += 1;
            }
        }
    }
    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }
    hunks
}

/// Get full diff for a specific file (combined staged + unstaged)
fn get_file_diff(cwd: &str, path: &str) -> Vec<GitDiffHunk> {
    // Try staged diff first
    let staged = std::process::Command::new("git")
        .args(["diff", "--cached", "--unified=3", "--", path])
        .current_dir(cwd)
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();

    let unstaged = std::process::Command::new("git")
        .args(["diff", "--unified=3", "--", path])
        .current_dir(cwd)
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();

    // Merge: if file appears in both, combine hunks; else use whichever has content
    let combined = if !staged.is_empty() && !unstaged.is_empty() {
        format!("{}\n{}", staged, unstaged)
    } else if !staged.is_empty() {
        staged
    } else {
        unstaged
    };

    parse_unified_diff(&combined)
}

fn collect_git_diff_metadata(
    cwd: &str,
) -> Result<
    (
        String,
        std::collections::HashMap<String, (i32, i32)>,
        std::collections::HashMap<String, String>,
    ),
    String,
> {
    let branch = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                Ok("HEAD".to_string())
            }
        })
        .unwrap_or_else(|_| "HEAD".to_string());

    let staged_numstat = std::process::Command::new("git")
        .args(["diff", "--cached", "--numstat"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let unstaged_numstat = std::process::Command::new("git")
        .args(["diff", "--numstat"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let mut file_map: std::collections::HashMap<String, (i32, i32)> =
        std::collections::HashMap::new();

    let staged_text = String::from_utf8_lossy(&staged_numstat.stdout);
    for line in staged_text.lines() {
        if let Some((path, add, del)) = parse_numstat(line) {
            let entry = file_map.entry(path).or_insert((0, 0));
            entry.0 += add;
            entry.1 += del;
        }
    }

    let unstaged_text = String::from_utf8_lossy(&unstaged_numstat.stdout);
    for line in unstaged_text.lines() {
        if let Some((path, add, del)) = parse_numstat(line) {
            let entry = file_map.entry(path).or_insert((0, 0));
            entry.0 += add;
            entry.1 += del;
        }
    }

    let status_out = std::process::Command::new("git")
        .args(["status", "--porcelain=v1"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let status_text = String::from_utf8_lossy(&status_out.stdout);
    let mut status_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for line in status_text.lines() {
        if line.len() < 3 {
            continue;
        }
        let xy = &line[0..2];
        let file_part = line[3..].trim();
        let path = if file_part.contains(" -> ") {
            file_part.split(" -> ").last().unwrap_or(file_part).to_string()
        } else {
            file_part.to_string()
        };
        let st = if xy.contains('A') {
            "added"
        } else if xy.contains('D') {
            "deleted"
        } else if xy.contains('R') {
            "renamed"
        } else {
            "modified"
        };
        status_map.insert(path, st.to_string());
    }

    Ok((branch, file_map, status_map))
}

#[tauri::command]
pub fn git_diff(cwd: String) -> Result<GitDiffResult, String> {
    let (branch, file_map, status_map) = collect_git_diff_metadata(&cwd)?;

    let mut files: Vec<GitChangedFile> = Vec::new();
    let mut total_additions = 0i32;
    let mut total_deletions = 0i32;

    let mut sorted_paths: Vec<String> = file_map.keys().cloned().collect();
    sorted_paths.sort();

    for path in sorted_paths {
        let (add, del) = file_map[&path];
        let status = status_map.get(&path).cloned().unwrap_or_else(|| "modified".to_string());
        total_additions += add;
        total_deletions += del;
        files.push(GitChangedFile {
            path,
            status,
            additions: add,
            deletions: del,
            hunks: Vec::new(),
        });
    }

    Ok(GitDiffResult {
        branch,
        files,
        total_additions,
        total_deletions,
    })
}

#[tauri::command]
pub fn git_diff_file(cwd: String, path: String) -> Result<GitChangedFile, String> {
    let (_, file_map, status_map) = collect_git_diff_metadata(&cwd)?;
    let (additions, deletions) = file_map.get(&path).copied().unwrap_or((0, 0));
    let status = status_map
        .get(&path)
        .cloned()
        .unwrap_or_else(|| "modified".to_string());

    Ok(GitChangedFile {
        path: path.clone(),
        status,
        additions,
        deletions,
        hunks: get_file_diff(&cwd, &path),
    })
}

#[derive(Serialize, Clone)]
pub struct GitBranch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
}

#[tauri::command]
pub fn git_branches(cwd: String) -> Result<Vec<GitBranch>, String> {
    let output = std::process::Command::new("git")
        .args(["branch", "-a", "--format=%(refname:short)|%(HEAD)"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<GitBranch> = text.lines()
        .filter(|l| !l.is_empty())
        .map(|l| {
            let parts: Vec<&str> = l.splitn(2, '|').collect();
            let name = parts[0].trim().to_string();
            let current = parts.get(1).map(|s| s.trim() == "*").unwrap_or(false);
            let remote = name.starts_with("remotes/");
            GitBranch { name, current, remote }
        })
        .collect();

    branches.sort_by(|a, b| {
        b.current.cmp(&a.current)
            .then(a.remote.cmp(&b.remote))
            .then(a.name.cmp(&b.name))
    });

    Ok(branches)
}

#[tauri::command]
pub fn git_checkout_branch(cwd: String, branch: String) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["checkout", &branch])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[derive(Serialize)]
pub struct GitStatusSummary {
    count: usize,
    branch: String,
}

#[tauri::command]
pub fn git_status_count(cwd: String) -> Result<GitStatusSummary, String> {
    let status_out = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let status_text = String::from_utf8_lossy(&status_out.stdout);
    let count = status_text.lines().filter(|l| l.len() >= 3).count();

    let branch_out = std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&cwd)
        .output()
        .unwrap_or_else(|_| std::process::Output {
            status: Default::default(),
            stdout: Vec::new(),
            stderr: Vec::new(),
        });
        
    let branch = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();

    Ok(GitStatusSummary { count, branch })
}

fn format_command_output(output: std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => String::new(),
    }
}

fn ensure_command_exists(command: &str) -> Result<(), String> {
    which(command)
        .map(|_| ())
        .map_err(|_| format!("Required command `{command}` was not found on PATH."))
}

fn run_command_checked(
    program: &str,
    args: &[&str],
    cwd: Option<&str>,
) -> Result<String, String> {
    ensure_command_exists(program)?;

    let mut command = Command::new(program);
    command.args(args);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    let output = command.output().map_err(|e| e.to_string())?;
    let success = output.status.success();
    let code = output.status.code();
    let combined = format_command_output(output);

    if success {
        Ok(combined)
    } else if combined.is_empty() {
        Err(format!(
            "`{program}` exited with status {}.",
            code.map(|code| code.to_string()).unwrap_or_else(|| "unknown".into())
        ))
    } else {
        Err(combined)
    }
}

fn make_temp_checkout_dir(prefix: &str) -> Result<PathBuf, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir = std::env::temp_dir().join(format!("nexus-{prefix}-{stamp}-{}", std::process::id()));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn clone_repo_temp(url: &str, prefix: &str) -> Result<PathBuf, String> {
    ensure_command_exists("git")?;
    let temp_root = make_temp_checkout_dir(prefix)?;
    let repo_dir = temp_root.join("repo");
    let output = Command::new("git")
        .args(["clone", "--depth", "1", url, repo_dir.to_string_lossy().as_ref()])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(repo_dir)
    } else {
        let combined = format_command_output(output);
        let _ = fs::remove_dir_all(&temp_root);
        if combined.is_empty() {
            Err(format!("Failed to clone repository: {url}"))
        } else {
            Err(combined)
        }
    }
}

fn parse_markdown_title(content: &str, fallback: &str) -> String {
    content
        .lines()
        .map(str::trim)
        .find_map(|line| {
            if let Some(value) = line.strip_prefix("# ") {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
            None
        })
        .unwrap_or_else(|| fallback.replace('-', " "))
}

fn is_nexus_managed_agency_file(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(content.starts_with(NEXUS_MANAGED_AGENCY_MARKER))
}

fn scan_agency_agents(repo_dir: &Path) -> Result<Vec<(AgencyAgentOption, PathBuf)>, String> {
    let excluded_dirs = [
        ".git",
        ".github",
        "integrations",
        "scripts",
        "examples",
    ];
    let mut results = Vec::new();

    for entry in fs::read_dir(repo_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_dir() {
            continue;
        }

        let category = entry.file_name().to_string_lossy().to_string();
        if excluded_dirs.contains(&category.as_str()) {
            continue;
        }

        let mut stack = vec![entry.path()];
        while let Some(dir) = stack.pop() {
            for nested in fs::read_dir(&dir).map_err(|e| e.to_string())? {
                let nested = nested.map_err(|e| e.to_string())?;
                let nested_type = nested.file_type().map_err(|e| e.to_string())?;
                let nested_path = nested.path();
                if nested_type.is_dir() {
                    stack.push(nested_path);
                    continue;
                }

                if nested_path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                    continue;
                }

                let filename = nested_path.file_name().and_then(|name| name.to_str()).unwrap_or_default();
                if filename.eq_ignore_ascii_case("README.md") {
                    continue;
                }

                let slug = nested_path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or_default()
                    .to_string();
                if slug.is_empty() {
                    continue;
                }

                let content = fs::read_to_string(&nested_path).map_err(|e| e.to_string())?;
                let name = parse_markdown_title(&content, &slug);
                results.push((
                    AgencyAgentOption {
                        slug,
                        name,
                        category: category.clone(),
                    },
                    nested_path,
                ));
            }
        }
    }

    results.sort_by(|(left, _), (right, _)| {
        left.category
            .cmp(&right.category)
            .then(left.name.cmp(&right.name))
            .then(left.slug.cmp(&right.slug))
    });
    Ok(results)
}

fn map_spec_kit_ai(agent_id: &str) -> Option<&'static str> {
    match agent_id {
        "codex" => Some("codex"),
        "claude-code" => Some("claude"),
        "gemini-cli" => Some("gemini"),
        _ => None,
    }
}

#[tauri::command]
pub fn list_agency_agents() -> Result<Vec<AgencyAgentOption>, String> {
    let repo_dir = clone_repo_temp(AGENCY_AGENTS_REPO, "agency-agents")?;
    let temp_root = repo_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Failed to resolve temporary agency repo root.".to_string())?;
    let result = scan_agency_agents(&repo_dir).map(|entries| {
        entries
            .into_iter()
            .map(|(option, _)| option)
            .collect::<Vec<_>>()
    });
    let _ = fs::remove_dir_all(temp_root);
    result
}

#[tauri::command]
pub fn sync_project_agency_agent(
    project_path: String,
    slug: String,
    enabled: bool,
) -> Result<String, String> {
    let project_dir = Path::new(&project_path);
    if !project_dir.is_dir() {
        return Err(format!("Project path is not a directory: {project_path}"));
    }

    let agent_file_path = project_dir.join(AGENCY_AGENT_DEST_RELATIVE_PATH);
    let manifest_path = project_dir.join(AGENCY_AGENT_MANIFEST_RELATIVE_PATH);
    let legacy_agent_file_path = project_dir.join(LEGACY_AGENCY_AGENT_DEST_RELATIVE_PATH);

    if !enabled {
        match is_nexus_managed_agency_file(&agent_file_path)? {
            true => {
                let _ = fs::remove_file(&agent_file_path);
            }
            false => {}
        }
        let _ = fs::remove_file(&manifest_path);
        let _ = fs::remove_file(&legacy_agent_file_path);
        return Ok(format!("Agency agent disabled for {}.", project_path));
    }

    let repo_dir = clone_repo_temp(AGENCY_AGENTS_REPO, "agency-agents")?;
    let temp_root = repo_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Failed to resolve temporary agency repo root.".to_string())?;
    let entries = scan_agency_agents(&repo_dir)?;
    let selected = entries
        .into_iter()
        .find(|(option, _)| option.slug == slug)
        .ok_or_else(|| format!("Agency agent `{slug}` was not found upstream."))?;

    if agent_file_path.exists() && !is_nexus_managed_agency_file(&agent_file_path)? {
        let _ = fs::remove_dir_all(temp_root);
        return Err(format!(
            "{} already exists and is not Nexus-managed. Move or rename it before enabling Agency Agent.",
            agent_file_path.to_string_lossy()
        ));
    }

    if let Some(parent) = agent_file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let source_content = fs::read_to_string(&selected.1).map_err(|e| e.to_string())?;
    let wrapped = format!(
        "<!-- Nexus-managed agency agent. Source: {} ({}) -->\n\n{}",
        selected.0.name,
        selected.1.to_string_lossy(),
        source_content
    );
    fs::write(&agent_file_path, wrapped).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&legacy_agent_file_path);

    let manifest = serde_json::json!({
        "version": 1,
        "enabled": true,
        "slug": selected.0.slug,
        "name": selected.0.name,
        "category": selected.0.category,
        "source_repo": AGENCY_AGENTS_REPO,
        "source_path": selected.1.to_string_lossy(),
        "installed_path": agent_file_path.to_string_lossy(),
    });
    if let Some(parent) = manifest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(
        &manifest_path,
        format!("{}\n", serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?),
    )
    .map_err(|e| e.to_string())?;

    let _ = fs::remove_dir_all(temp_root);

    Ok(format!(
        "Agency agent `{}` installed to {}.",
        selected.0.name,
        agent_file_path.to_string_lossy()
    ))
}

#[tauri::command]
pub fn open_in_file_manager(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = if which("xdg-open").is_ok() {
        let mut command = Command::new("xdg-open");
        command.arg(&path);
        command
    } else if which("gio").is_ok() {
        let mut command = Command::new("gio");
        command.args(["open", &path]);
        command
    } else {
        return Err("No supported file-manager opener found. Install `xdg-open` or `gio`.".into());
    };

    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn bootstrap_spec_kit(project_path: String, agent_id: String) -> Result<String, String> {
    let ai = map_spec_kit_ai(&agent_id).ok_or_else(|| {
        format!(
            "Spec Kit setup is only supported for Codex CLI, Claude Code, and Gemini CLI. Got `{agent_id}`."
        )
    })?;

    let project_dir = Path::new(&project_path);
    if !project_dir.is_dir() {
        return Err(format!("Project path is not a directory: {project_path}"));
    }

    if project_dir.join(".specify").exists() {
        return Ok(format!("Spec Kit already initialized in {project_path}. Skipped."));
    }

    let mut args = vec!["--from", SPEC_KIT_REPO, "specify", "init", "--here", "--force", "--ai", ai];
    if agent_id == "codex" {
        args.push("--ai-skills");
    }
    #[cfg(target_os = "windows")]
    {
        args.extend(["--script", "ps"]);
    }

    let output = run_command_checked("uvx", &args, Some(&project_path))?;

    let summary = if output.is_empty() {
        format!("Spec Kit bootstrapped in {project_path} for `{ai}`.")
    } else {
        format!("Spec Kit bootstrapped in {project_path} for `{ai}`.\n{output}")
    };

    Ok(summary)
}

#[tauri::command]
pub fn install_caveman(agent_id: String) -> Result<String, String> {
    match agent_id.as_str() {
        "claude-code" => {
            let first = run_command_checked(
                "claude",
                &["plugin", "marketplace", "add", "JuliusBrussee/caveman"],
                None,
            )?;
            let second = run_command_checked(
                "claude",
                &["plugin", "install", "caveman@caveman"],
                None,
            )?;
            Ok(format!(
                "Caveman installed for Claude Code.\n{}\n{}",
                first.trim(),
                second.trim()
            ).trim().to_string())
        }
        "gemini-cli" => {
            let output = run_command_checked(
                "gemini",
                &["extensions", "install", CAVEMAN_REPO],
                None,
            )?;
            Ok(if output.is_empty() {
                "Caveman installed for Gemini CLI.".to_string()
            } else {
                format!("Caveman installed for Gemini CLI.\n{output}")
            })
        }
        "cline" => {
            let output = run_command_checked(
                "npx",
                &["skills", "add", "JuliusBrussee/caveman", "-a", "cline"],
                None,
            )?;
            Ok(if output.is_empty() {
                "Caveman installed for Cline.".to_string()
            } else {
                format!("Caveman installed for Cline.\n{output}")
            })
        }
        "kiro" => {
            let output = run_command_checked(
                "npx",
                &["skills", "add", "JuliusBrussee/caveman", "-a", "kiro-cli"],
                None,
            )?;
            Ok(if output.is_empty() {
                "Caveman installed for Kiro CLI.".to_string()
            } else {
                format!("Caveman installed for Kiro CLI.\n{output}")
            })
        }
        "codex" => Err(
            "Codex Caveman install is not yet automatable from Nexus. Upstream requires opening Codex in a local Caveman repo and installing the plugin through `/plugins`."
                .into(),
        ),
        _ => Err(format!(
            "No verified one-click Caveman install flow is documented upstream for `{agent_id}` yet."
        )),
    }
}
