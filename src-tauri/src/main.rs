// Hide the console window on Windows in all builds (dev + release).
// On Windows a GUI app should never show a terminal. Developers who need
// stdout can launch the binary from an existing terminal.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod pty;
mod state;

use crate::{
    pty::{ 
        bootstrap_spec_kit, detect_installed_agents, git_branches, git_checkout_branch, git_diff, git_diff_file, git_status_count, install_caveman, kill_pty,
        list_agency_agents, list_processes, open_in_file_manager, resize_pty, runtime_info, spawn_pty, sync_project_agency_agent, write_pty,
    },
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
            crate::pty::system_health,
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
            crate::pty::kill_process,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Nexus application");
}
