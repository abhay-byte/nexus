use crate::state::{AppState, PtySession};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Arc,
    thread,
};
use tauri::{AppHandle, Emitter, State};
use which::which;

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
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let mut builder = CommandBuilder::new(if command.trim().is_empty() {
        default_shell(shell_override)
    } else {
        command
    });

    if !cwd.trim().is_empty() {
        builder.cwd(cwd);
    }

    for arg in args {
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
