// Standalone HTTP + WebSocket server binary — runs Nexus backend without GUI
// Usage: cargo run --bin nexus-headless
// Or after build: ./target/release/nexus-headless

use nexus::server::{start_http_server, WebState};
use nexus::state::AppState;
use nexus::ws_server::{start_ws_server, WsState};
use std::sync::Arc;

fn print_banner(http_port: u16, ws_port: u16) {
    let local_ips = get_local_ips();
    
    println!(r#"
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║   ██╗  ██╗███████╗ █████╗ ██████╗ ██╗     ███████╗███████╗   ║
    ║   ██║  ██║██╔════╝██╔══██╗██╔══██╗██║     ██╔════╝██╔════╝   ║
    ║   ███████║█████╗  ███████║██║  ██║██║     █████╗  ███████╗   ║
    ║   ██╔══██║██╔══╝  ██╔══██║██║  ██║██║     ██╔══╝  ╚════██║   ║
    ║   ██║  ██║███████╗██║  ██║██████╔╝███████╗███████╗███████║   ║
    ║   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚══════╝   ║
    ║                                                               ║
    ║         Nexus Headless Server  v{}                          ║
    ╚═══════════════════════════════════════════════════════════════╝
    "#, env!("CARGO_PKG_VERSION"));

    println!("  ┌─ Access Points ──────────────────────────────────────────────┐");
    println!("  │                                                              │");
    println!("  │  🌐  HTTP Frontend:  http://127.0.0.1:{}                    │", http_port);
    println!("  │  ⚡  WebSocket:      ws://127.0.0.1:{}                       │", ws_port);
    println!("  │                                                              │");
    
    for ip in &local_ips {
        if !ip.starts_with("127.") && !ip.starts_with("::1") {
            println!("  │  🌐  Network:        http://{}:{}                           │", ip, http_port);
        }
    }
    
    println!("  │                                                              │");
    println!("  │  📁  State file:     nexus_web_state.json                   │");
    println!("  │  🔒  Allowed IPs:    localhost + local network              │");
    println!("  │                                                              │");
    println!("  └──────────────────────────────────────────────────────────────┘");
    println!();
    println!("  Press Ctrl+C to stop\n");
}

fn get_local_ips() -> Vec<String> {
    let mut ips = vec!["127.0.0.1".to_string()];
    if let Ok(ifas) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in ifas {
            let s = ip.to_string();
            if !ips.contains(&s) && !s.starts_with("127.") {
                ips.push(s);
            }
        }
    }
    ips
}

fn main() {
    let http_port = std::env::var("NEXUS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(7878);
    let ws_port = std::env::var("NEXUS_WS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(7879);

    let app_state = Arc::new(AppState::default());
    let web_state = Arc::new(std::sync::Mutex::new(WebState::default()));
    let ws_state = Arc::new(WsState::default());

    print_banner(http_port, ws_port);

    // Start HTTP server in a background thread (tiny_http is blocking)
    {
        let state_clone = Arc::clone(&app_state);
        let web_clone = Arc::clone(&web_state);
        let ws_clone = Arc::clone(&ws_state);
        std::thread::spawn(move || {
            start_http_server(state_clone, web_clone, Some(ws_clone));
        });
    }

    // Start WebSocket server with tokio runtime
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    rt.block_on(async {
        start_ws_server(app_state, ws_state).await;
    });
}