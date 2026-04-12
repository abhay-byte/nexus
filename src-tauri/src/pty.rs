use crate::state::{AppState, PtySession};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::Arc,
    thread,
};
use tauri::{AppHandle, Emitter, State};
use which::which;

fn shell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
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
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn shell_wrap_command(shell: &str, command: &str, args: &[String]) -> (String, Vec<String>) {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(shell_escape(command));
    for arg in args {
        parts.push(shell_escape(arg));
    }

    let shell_name = Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(shell);

    if shell_name == "fish" {
        (shell.to_string(), vec!["-lc".to_string(), parts.join(" ")])
    } else {
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
    candidates
        .into_iter()
        .map(|(id, command)| InstalledAgentStatus {
            id,
            installed: which(&command).is_ok(),
            command,
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

#[tauri::command]
pub fn git_diff(cwd: String) -> Result<GitDiffResult, String> {
    // Current branch
    let branch = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&cwd)
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

    // Combined numstat: staged + unstaged
    let staged_numstat = std::process::Command::new("git")
        .args(["diff", "--cached", "--numstat"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let unstaged_numstat = std::process::Command::new("git")
        .args(["diff", "--numstat"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    // Build file map: path → (add, del, status)
    let mut file_map: std::collections::HashMap<String, (i32, i32)> = std::collections::HashMap::new();

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

    // Git status for file status (M/A/D/R)
    let status_out = std::process::Command::new("git")
        .args(["status", "--porcelain=v1"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let status_text = String::from_utf8_lossy(&status_out.stdout);
    let mut status_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for line in status_text.lines() {
        if line.len() < 3 { continue; }
        let xy = &line[0..2];
        let file_part = line[3..].trim();
        // Handle renamed "old -> new"
        let path = if file_part.contains(" -> ") {
            file_part.split(" -> ").last().unwrap_or(file_part).to_string()
        } else {
            file_part.to_string()
        };
        let st = if xy.contains('A') { "added" }
            else if xy.contains('D') { "deleted" }
            else if xy.contains('R') { "renamed" }
            else { "modified" };
        status_map.insert(path, st.to_string());
    }

    let mut files: Vec<GitChangedFile> = Vec::new();
    let mut total_additions = 0i32;
    let mut total_deletions = 0i32;

    let mut sorted_paths: Vec<String> = file_map.keys().cloned().collect();
    sorted_paths.sort();

    for path in sorted_paths {
        let (add, del) = file_map[&path];
        let status = status_map.get(&path).cloned().unwrap_or_else(|| "modified".to_string());
        let hunks = get_file_diff(&cwd, &path);
        total_additions += add;
        total_deletions += del;
        files.push(GitChangedFile {
            path,
            status,
            additions: add,
            deletions: del,
            hunks,
        });
    }

    Ok(GitDiffResult {
        branch,
        files,
        total_additions,
        total_deletions,
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
