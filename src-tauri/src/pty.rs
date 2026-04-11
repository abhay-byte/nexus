use crate::state::{AppState, PtySession};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Arc,
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};
use which::which;

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

    // Inherit the full parent process environment (PATH, API keys, HOME, XDG vars, etc.)
    // Without this, tools like Claude Code can't find their auth tokens and ask to log in again.
    for (key, value) in std::env::vars() {
        builder.env(key, value);
    }

    // Override with required terminal environment variables so TUI tools (codex, etc.) work correctly.
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    builder.env("LANG", std::env::var("LANG").unwrap_or_else(|_| "en_US.UTF-8".to_string()));

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
