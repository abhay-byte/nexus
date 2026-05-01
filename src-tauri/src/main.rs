// Hide the console window on Windows in all builds (dev + release).
// On Windows a GUI app should never show a terminal. Developers who need
// stdout can launch the binary from an existing terminal.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use nexus::{
    pty::*,
    server::{start_http_server, WebState},
    state::AppState,
};
use std::sync::Arc;

fn main() {
    // Fix HOME / XDG vars and PATH in case this process was launched from an editor
    // or desktop launcher that overrides those to sandboxed/partial paths.
    // Agents (codex, claude, gemini etc.) store auth tokens under the real $HOME.
    nexus::pty::fix_home_env();

    let app_state = Arc::new(AppState::default());
    let web_state = Arc::new(std::sync::Mutex::new(WebState::default()));

    // Start HTTP server in background (browser-accessible mode)
    {
        let state_clone = Arc::clone(&app_state);
        let web_clone = Arc::clone(&web_state);
        std::thread::spawn(move || {
            start_http_server(state_clone, web_clone, None);
        });
    }

    tauri::Builder::default()
        .manage(app_state)
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
            system_health,
            git_diff,
            git_diff_file,
            git_branches,
            git_checkout_branch,
            git_status_count,
            open_in_file_manager,
            bootstrap_spec_kit,
            install_caveman,
            list_agency_agents,
            sync_project_agency_agent,
            list_processes,
            kill_process,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Nexus application");
}