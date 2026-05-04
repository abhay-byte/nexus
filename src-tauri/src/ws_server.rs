use crate::{pty, state::AppState};
use base64::Engine as _;
use futures::{SinkExt, StreamExt};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};

/// Shared state for active WebSocket terminal sessions
pub struct WsState {
    /// session_id → sender channel for WebSocket messages
    pub sessions: Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<Message>>>,
}

impl Default for WsState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

impl WsState {
    pub fn register(&self, session_id: &str, tx: tokio::sync::mpsc::UnboundedSender<Message>) {
        self.sessions.lock().unwrap().insert(session_id.to_string(), tx);
    }

    pub fn unregister(&self, session_id: &str) {
        self.sessions.lock().unwrap().remove(session_id);
    }

    pub fn get(&self, session_id: &str) -> Option<tokio::sync::mpsc::UnboundedSender<Message>> {
        self.sessions.lock().unwrap().get(session_id).cloned()
    }

    pub fn send_binary(&self, session_id: &str, data: Vec<u8>) {
        if let Some(tx) = self.get(session_id) {
            let _ = tx.send(Message::Binary(data));
        }
    }

    pub fn send_json(&self, session_id: &str, event: &str, payload: serde_json::Value) {
        if let Some(tx) = self.get(session_id) {
            let msg = serde_json::json!({"event": event, "payload": payload});
            let _ = tx.send(Message::Text(msg.to_string()));
        }
    }

    pub fn send_text(&self, session_id: &str, text: String) {
        if let Some(tx) = self.get(session_id) {
            let _ = tx.send(Message::Text(text));
        }
    }
}

/// Start WebSocket server for terminal streaming
pub async fn start_ws_server(app_state: Arc<AppState>, ws_state: Arc<WsState>) {
    let port = std::env::var("NEXUS_WS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(7879);

    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            println!("[Nexus WS] WebSocket server running on ws://{}", addr);
            l
        }
        Err(e) => {
            eprintln!("[Nexus WS] Failed to bind WebSocket server: {}", e);
            return;
        }
    };

    while let Ok((stream, peer)) = listener.accept().await {
        let app = Arc::clone(&app_state);
        let ws = Arc::clone(&ws_state);
        tokio::spawn(handle_ws_connection(stream, peer, app, ws));
    }
}

async fn handle_ws_connection(
    stream: TcpStream,
    peer: SocketAddr,
    app_state: Arc<AppState>,
    ws_state: Arc<WsState>,
) {
    println!("[Nexus WS] Connection from {}", peer);

    let ws_stream = match accept_async(stream).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[Nexus WS] Failed to accept WebSocket: {}", e);
            return;
        }
    };

    let (mut ws_tx, mut ws_rx) = ws_stream.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Spawn task to forward channel → WebSocket
    let forward_handle = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Read messages from WebSocket
    let mut current_session: Option<String> = None;

    while let Some(msg) = ws_rx.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(cmd) = serde_json::from_str::<WsCommand>(&text) {
                    match cmd {
                        WsCommand::Spawn { session_id, command, args, cwd, env, cols, rows, shell_override } => {
                            // Allow multiple sessions per connection — do NOT kill previous sessions.
                            // Only clean up if the same session_id is being respawned.
                            if let Some(ref old) = current_session {
                                if old == &session_id {
                                    let _ = pty::kill_pty_inner(old, &app_state);
                                    ws_state.unregister(old);
                                    current_session = None;
                                }
                            }

                            match spawn_pty_ws(
                                &session_id,
                                command,
                                args,
                                cwd,
                                env,
                                cols.unwrap_or(80),
                                rows.unwrap_or(24),
                                shell_override,
                                &app_state,
                                Arc::clone(&ws_state),
                            ) {
                                Ok(_) => {
                                    current_session = Some(session_id.clone());
                                    ws_state.register(&session_id, tx.clone());
                                    let _ = tx.send(Message::Text(
                                        serde_json::json!({"event":"spawned","session_id":session_id}).to_string()
                                    ));
                                }
                                Err(e) => {
                                    let _ = tx.send(Message::Text(
                                        serde_json::json!({"event":"error","error":e}).to_string()
                                    ));
                                }
                            }
                        }
                        WsCommand::Write { session_id, data } => {
                            if let Ok(bytes) = base64_decode(&data) {
                                let _ = pty::write_pty_inner(&session_id, &bytes, &app_state);
                            }
                        }
                        WsCommand::Resize { session_id, cols, rows } => {
                            let _ = pty::resize_pty_inner(&session_id, cols, rows, &app_state);
                        }
                        WsCommand::Kill { session_id } => {
                            let _ = pty::kill_pty_inner(&session_id, &app_state);
                            ws_state.unregister(&session_id);
                            if current_session.as_ref() == Some(&session_id) {
                                current_session = None;
                            }
                        }
                    }
                }
            }
            Ok(Message::Binary(data)) => {
                if let Some(ref session_id) = current_session {
                    let _ = pty::write_pty_inner(session_id, &data, &app_state);
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

    // Clean up
    if let Some(session_id) = current_session {
        let _ = pty::kill_pty_inner(&session_id, &app_state);
        ws_state.unregister(&session_id);
    }

    drop(tx);
    let _ = forward_handle.await;
    println!("[Nexus WS] Disconnected from {}", peer);
}

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
enum WsCommand {
    #[serde(rename = "spawn")]
    Spawn {
        session_id: String,
        command: String,
        #[serde(default)]
        args: Vec<String>,
        cwd: String,
        #[serde(default)]
        env: std::collections::HashMap<String, String>,
        cols: Option<u16>,
        rows: Option<u16>,
        shell_override: Option<String>,
    },
    #[serde(rename = "write")]
    Write {
        session_id: String,
        data: String, // base64 encoded
    },
    #[serde(rename = "resize")]
    Resize {
        session_id: String,
        cols: u16,
        rows: u16,
    },
    #[serde(rename = "kill")]
    Kill {
        session_id: String,
    },
}

pub fn spawn_pty_ws(
    session_id: &str,
    command: String,
    args: Vec<String>,
    cwd: String,
    env: std::collections::HashMap<String, String>,
    cols: u16,
    rows: u16,
    shell_override: Option<String>,
    app_state: &AppState,
    ws_state: Arc<WsState>,
) -> Result<(), String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::thread;

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let (spawn_command, spawn_args) = if command.trim().is_empty() {
        let shell = pty::default_shell(shell_override);
        (shell, Vec::new())
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
    for (key, value) in std::env::vars() {
        builder.env(key, value);
    }
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    for (key, value) in env {
        builder.env(key, value);
    }

    let reader_session_id = session_id.to_string();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| e.to_string())?;

    let session = Arc::new(crate::state::PtySession::new(writer, pair.master, child));
    {
        let mut sessions = app_state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.to_string(), Arc::clone(&session));
    }

    // Spawn reader thread that sends PTY output via ws_state
    let ws = Arc::new(std::sync::Mutex::new(ws_state));
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let msg = serde_json::json!({
                        "event": "exit",
                        "session_id": reader_session_id
                    }).to_string();
                    if let Ok(w) = ws.lock() {
                        w.send_text(&reader_session_id, msg);
                    }
                    break;
                }
                Ok(size) => {
                    let payload = buffer[..size].to_vec();
                    if let Ok(w) = ws.lock() {
                        let base64_data = base64::engine::general_purpose::STANDARD.encode(&payload);
                        let msg = serde_json::json!({
                            "event": "pty-output",
                            "session_id": reader_session_id,
                            "data": base64_data
                        }).to_string();
                        w.send_text(&reader_session_id, msg);
                    }
                }
                Err(_) => {
                    let msg = serde_json::json!({
                        "event": "exit",
                        "session_id": reader_session_id
                    }).to_string();
                    if let Ok(w) = ws.lock() {
                        w.send_text(&reader_session_id, msg);
                    }
                    break;
                }
            }
        }
    });

    // SIGWINCH after initialization
    {
        let sigwinch_session = Arc::clone(&session);
        thread::spawn(move || {
            thread::sleep(std::time::Duration::from_millis(500));
            let master = sigwinch_session.master.lock().unwrap();
            let _ = master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        });
    }

    Ok(())
}

fn base64_decode(s: &str) -> Result<Vec<u8>, ()> {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut map = [0u8; 256];
    for (i, &c) in TABLE.iter().enumerate() {
        map[c as usize] = i as u8;
    }

    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for c in s.chars() {
        if c == '=' {
            break;
        }
        let val = map.get(c as usize).copied().ok_or(())?;
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buf >> bits) as u8);
            buf &= (1u32 << bits) - 1;
        }
    }
    Ok(result)
}