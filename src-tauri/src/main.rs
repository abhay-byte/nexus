#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;
mod state;

use crate::{
    pty::{detect_installed_agents, kill_pty, resize_pty, runtime_info, spawn_pty, write_pty},
    state::AppState,
};

fn main() {
    // Fix HOME / XDG vars and PATH in case this process was launched from an editor
    // or desktop launcher that overrides those to sandboxed/partial paths.
    // Agents (codex, claude, gemini etc.) store auth tokens under the real $HOME.
    pty::fix_home_env();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            detect_installed_agents,
            runtime_info,
            crate::pty::system_health
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Nexus application");
}
