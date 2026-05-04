use crate::{
    pty,
    state::AppState,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    net::{IpAddr, SocketAddr},
    path::{Path, PathBuf},
    sync::Arc,
};
use tiny_http::{Header, Response, Server, StatusCode};

/// ─── Port cleanup ───────────────────────────────────────────────────────────

/// Kill any process already listening on the given TCP port so the
/// headless server can bind immediately without "Address already in use".
fn kill_port_occupiers(port: u16) {
    #[cfg(unix)]
    {
        // Try fuser first (most reliable on Linux)
        let _ = std::process::Command::new("fuser")
            .args(["-k", &format!("{}/tcp", port)])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        // Fallback: lsof + kill
        if let Ok(output) = std::process::Command::new("lsof")
            .args(["-t", "-i", &format!("tcp:{}", port)])
            .output()
        {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines().filter(|l| !l.is_empty()) {
                let _ = std::process::Command::new("kill")
                    .args(["-9", pid])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();
            }
        }

        // Final fallback: read /proc/*/fd/ ourselves
        let target = format!(":{:04X}", port); // e.g. ":1EBC" for 7878
        if let Ok(entries) = std::fs::read_dir("/proc") {
            for entry in entries.filter_map(|e| e.ok()) {
                let pid = entry.file_name().to_string_lossy().to_string();
                if !pid.chars().all(|c| c.is_ascii_digit()) {
                    continue;
                }
                let fd_dir = format!("/proc/{}/fd", pid);
                if let Ok(fds) = std::fs::read_dir(&fd_dir) {
                    for fd in fds.filter_map(|f| f.ok()) {
                        if let Ok(link) = std::fs::read_link(fd.path()) {
                            let s = link.to_string_lossy();
                            if s.contains("socket:[") && (s.contains(&target) || s.to_lowercase().contains(&target.to_lowercase())) {
                                let _ = std::process::Command::new("kill")
                                    .args(["-9", &pid])
                                    .stdout(std::process::Stdio::null())
                                    .stderr(std::process::Stdio::null())
                                    .status();
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(windows)]
    {
        // Use netstat -ano to find PID, then taskkill /F /PID <pid>
        let port_str = format!("{}:{}\r\n", port, port);
        if let Ok(output) = std::process::Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    // Format: Proto  Local Address          Foreign Address        State           PID
                    if parts[1].ends_with(&format!(":{}", port)) {
                        let pid = parts[4];
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/PID", pid])
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .status();
                    }
                }
            }
        }
    }
}

/// ─── IP Filtering ───────────────────────────────────────────────────────────

/// Build the allowlist from:
/// 1. Hardcoded localhost IPs
/// 2. Auto-detected local network IPs
/// 3. NEXUS_ALLOW_IPS env var (comma-separated, e.g. "192.168.1.5,10.0.0.2")
fn build_allowlist() -> Vec<IpAddr> {
    let mut ips = vec![
        "127.0.0.1".parse::<IpAddr>().unwrap(),
        "::1".parse::<IpAddr>().unwrap(),
    ];

    // Auto-detect primary local IP
    if let Ok(local_ip) = local_ip_address::local_ip() {
        if !ips.contains(&local_ip) {
            ips.push(local_ip);
        }
    }

    // Auto-detect all interface IPs
    if let Ok(ifas) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in ifas {
            if !ips.contains(&ip) {
                ips.push(ip);
            }
        }
    }

    // Optional user-defined extra IPs
    if let Ok(extra) = std::env::var("NEXUS_ALLOW_IPS") {
        for raw in extra.split(',') {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(ip) = trimmed.parse::<IpAddr>() {
                if !ips.contains(&ip) {
                    ips.push(ip);
                }
            } else {
                eprintln!("[Nexus Server] Warning: NEXUS_ALLOW_IPS contains invalid IP '{}'", trimmed);
            }
        }
    }

    ips
}

fn is_allowed_ip(remote: &SocketAddr, allowed: &[IpAddr]) -> bool {
    let remote_ip = remote.ip();
    
    // Check exact match first (for localhost)
    if allowed.contains(&remote_ip) {
        return true;
    }
    
    // Check if remote IP is in the same subnet as any allowed IP
    for allowed_ip in allowed {
        match (allowed_ip, remote_ip) {
            (std::net::IpAddr::V4(allowed_v4), std::net::IpAddr::V4(remote_v4)) => {
                // Allow if in the same /24 subnet (192.168.1.x)
                let allowed_bytes = allowed_v4.octets();
                let remote_bytes = remote_v4.octets();
                if allowed_bytes[0..3] == remote_bytes[0..3] {
                    // Exclude loopback and link-local
                    if !remote_v4.is_loopback() && !remote_v4.is_link_local() {
                        return true;
                    }
                }
                // Also allow entire 192.168.x.x and 10.x.x.x and 172.16.x.x-172.31.x.x ranges
                if is_private_ipv4(remote_v4) {
                    return true;
                }
            }
            (std::net::IpAddr::V6(allowed_v6), std::net::IpAddr::V6(remote_v6)) => {
                // For IPv6, allow if they're in the same /64 subnet
                let allowed_bytes = allowed_v6.octets();
                let remote_bytes = remote_v6.octets();
                if allowed_bytes[0..8] == remote_bytes[0..8] {
                    // Exclude loopback and link-local
                    if !remote_v6.is_loopback() {
                        return true;
                    }
                }
            }
            _ => {}
        }
    }
    
    false
}

fn is_private_ipv4(ip: std::net::Ipv4Addr) -> bool {
    let bytes = ip.octets();
    // 192.168.0.0/16
    if bytes[0] == 192 && bytes[1] == 168 {
        return true;
    }
    // 10.0.0.0/8
    if bytes[0] == 10 {
        return true;
    }
    // 172.16.0.0/12
    if bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31 {
        return true;
    }
    false
}

/// ─── Static File Serving ───────────────────────────────────────────────────

fn guess_mime(path: &Path) -> &'static str {
    mime_guess::from_path(path)
        .first_raw()
        .unwrap_or("application/octet-stream")
}

fn find_dist_dir() -> Option<PathBuf> {
    // 1. Try relative to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in &["dist", "../dist", "../../dist", "../../../dist"] {
                let candidate = dir.join(rel);
                if candidate.is_dir() {
                    return Some(candidate);
                }
            }
        }
    }

    // 2. Try current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("dist");
        if candidate.is_dir() {
            return Some(candidate);
        }
    }

    // 3. Try compile-time project directory (for dev builds)
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest_dir.join("../dist");
    if candidate.is_dir() {
        return Some(candidate);
    }

    // 4. Try XDG data directories
    if let Ok(home) = std::env::var("HOME") {
        let candidate = PathBuf::from(&home).join(".local/share/nexus/dist");
        if candidate.is_dir() {
            return Some(candidate);
        }
    }

    None
}

fn read_file_response(path: &Path) -> Option<Response<std::io::Cursor<Vec<u8>>>> {
    let mut file = fs::File::open(path).ok()?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents).ok()?;
    let mime = guess_mime(path);
    let mut resp = Response::from_data(contents);
    resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).ok()?);
    Some(resp)
}

/// ─── CORS Headers ──────────────────────────────────────────────────────────

fn add_cors_headers<T: Read>(resp: &mut Response<T>) {
    let _ = resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
    let _ = resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, PUT, DELETE, OPTIONS"[..]).unwrap());
    let _ = resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap());
}

/// ─── JSON Helpers ──────────────────────────────────────────────────────────

fn json_response<T: Serialize>(data: &T, status: StatusCode) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = serde_json::to_vec(data).unwrap_or_else(|_| b"{}".to_vec());
    let mut resp = Response::from_data(body).with_status_code(status);
    let _ = resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
    add_cors_headers(&mut resp);
    resp
}

fn json_error(msg: &str, status: StatusCode) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = serde_json::json!({ "error": msg }).to_string().into_bytes();
    let mut resp = Response::from_data(body).with_status_code(status);
    let _ = resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
    add_cors_headers(&mut resp);
    resp
}

/// ─── API Response Types ────────────────────────────────────────────────────

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectPayload {
    pub id: Option<String>,
    pub name: String,
    pub path: String,
    pub category: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub agency_agent: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct KanbanTaskPayload {
    pub id: Option<String>,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub color: Option<String>,
}

// Reserved for WebSocket terminal support (Feature 2)
#[allow(dead_code)]
#[derive(Serialize, Deserialize)]
struct SessionPayload {
    project_id: String,
    agent_id: Option<String>,
    command: Option<String>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize)]
struct WritePayload {
    session_id: String,
    data: String,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize)]
struct ResizePayload {
    session_id: String,
    cols: u16,
    rows: u16,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize)]
struct GitPayload {
    cwd: String,
    branch: Option<String>,
    file: Option<String>,
}

/// ─── Persistent Disk Store ────────────────────────────────────────────────

const WEB_STATE_PATH: &str = "nexus_web_state.json";

fn load_web_state() -> WebState {
    match std::fs::read_to_string(WEB_STATE_PATH) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => WebState::default(),
    }
}

fn save_web_state(state: &WebState) {
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(WEB_STATE_PATH, json);
    }
}

/// ─── In-Memory Stores (mirrors frontend localStorage in browser mode) ──────

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct WebState {
    pub projects: Vec<ProjectPayload>,
    pub kanban_tasks: Vec<KanbanTaskPayload>,
}

/// ─── Main Server ───────────────────────────────────────────────────────────

pub fn start_http_server(
    state: Arc<AppState>,
    web_state: Arc<std::sync::Mutex<WebState>>,
    ws_state: Option<Arc<crate::ws_server::WsState>>,
) {
    // Load persisted state on startup
    {
        let persisted = load_web_state();
        let mut ws = web_state.lock().unwrap();
        ws.projects = persisted.projects;
        ws.kanban_tasks = persisted.kanban_tasks;
        println!("[Nexus Server] Loaded {} projects, {} kanban tasks from disk",
            ws.projects.len(), ws.kanban_tasks.len());
    }
    let port = std::env::var("NEXUS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(7878);

    let addr = format!("0.0.0.0:{}", port);
    kill_port_occupiers(port);
    std::thread::sleep(std::time::Duration::from_millis(500));
    let server = match Server::http(&addr) {
        Ok(s) => {
            println!("[Nexus Server] ============================================");
            println!("[Nexus Server]  HTTP server running on http://{}", addr);
            println!("[Nexus Server] ============================================");
            s
        }
        Err(e) => {
            eprintln!("[Nexus Server] Failed to start HTTP server: {}", e);
            return;
        }
    };

    let allowed_ips = build_allowlist();
    println!("[Nexus Server]  Allowed IPs (localhost + local network):");
    for ip in &allowed_ips {
        println!("[Nexus Server]    - {}", ip);
    }
    if std::env::var("NEXUS_ALLOW_IPS").is_ok() {
        println!("[Nexus Server]  (Plus extra IPs from NEXUS_ALLOW_IPS env var)");
    }
    println!("[Nexus Server] ============================================");
    let dist_dir = find_dist_dir();

    for mut request in server.incoming_requests() {
        let remote = match request.remote_addr() {
            Some(addr) => addr,
            None => {
                let _ = request.respond(json_error("Bad Request", StatusCode(400)));
                continue;
            }
        };

        // ── IP Filter ──
        if !is_allowed_ip(remote, &allowed_ips) {
            println!("[Nexus Server] BLOCKED request from {} — not in allowlist", remote.ip());
            let _ = request.respond(json_error("Forbidden", StatusCode(403)));
            continue;
        }

        // ── Extract request info before consuming ──
        let method = request.method().to_string();
        let url = request.url().to_string();
        let path = url.split('?').next().unwrap_or(&url).to_string();

        // Read body for API routes before consuming request
        let body = if path.starts_with("/api/") && (method == "POST" || method == "PUT") {
            let mut b = String::new();
            request.as_reader().read_to_string(&mut b).ok();
            Some(b)
        } else {
            None
        };

        // ── Handle Request ──
        let mut response = if path.starts_with("/api/") {
            handle_api(&method, &path, body, &state, &web_state, &ws_state)
        } else if let Some(dist) = dist_dir.as_ref() {
            serve_static_path(&path, dist)
                .unwrap_or_else(|| {
                    // Fallback to SPA index.html
                    let index = dist.join("index.html");
                    if index.exists() {
                        read_file_response(&index).unwrap_or_else(|| json_error("Not Found", StatusCode(404)))
                    } else {
                        json_error("Not Found", StatusCode(404))
                    }
                })
        } else {
            json_error("Not Found", StatusCode(404))
        };

        add_cors_headers(&mut response);
        let _ = request.respond(response);
    }
}

fn serve_static_path(path: &str, dist_dir: &Path) -> Option<Response<std::io::Cursor<Vec<u8>>>> {
    let safe_path = path.trim_start_matches('/');
    let file_path = if safe_path.is_empty() {
        dist_dir.join("index.html")
    } else {
        let p = dist_dir.join(safe_path);
        let canonical_dist = fs::canonicalize(dist_dir).ok()?;
        let canonical_file = fs::canonicalize(&p).ok()?;
        if !canonical_file.starts_with(&canonical_dist) {
            return None;
        }
        if p.is_dir() {
            p.join("index.html")
        } else {
            p
        }
    };

    if file_path.exists() {
        read_file_response(&file_path)
    } else {
        None
    }
}

fn handle_api(
    method: &str,
    path: &str,
    body: Option<String>,
    app_state: &Arc<AppState>,
    web_state: &Arc<std::sync::Mutex<WebState>>,
    ws_state: &Option<Arc<crate::ws_server::WsState>>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    // Helper to parse JSON body as serde_json::Value
    let parse_body = || -> Option<serde_json::Value> {
        body.as_ref().and_then(|b| serde_json::from_str(b).ok())
    };

    match (method, path) {
        // ── Health ──
        ("GET", "/api/health") => {
            json_response(&HealthResponse {
                status: "ok".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            }, StatusCode(200))
        }

        // ── Projects ──
        ("GET", "/api/projects") => {
            let state = web_state.lock().unwrap();
            json_response(&state.projects, StatusCode(200))
        }
        ("POST", "/api/projects") => {
            let payload: ProjectPayload = match body.as_ref().and_then(|b| serde_json::from_str(b).ok()) {
                Some(p) => p,
                None => return json_error("Invalid JSON", StatusCode(400)),
            };
            let mut state = web_state.lock().unwrap();
            let mut project = payload;
            if project.id.is_none() {
                project.id = Some(nanoid::nanoid!());
            }
            state.projects.push(project.clone());
            save_web_state(&state);
            json_response(&project, StatusCode(201))
        }
        ("PUT", path) if path.starts_with("/api/projects/") => {
            let id = path.trim_start_matches("/api/projects/");
            let payload: ProjectPayload = match body.as_ref().and_then(|b| serde_json::from_str(b).ok()) {
                Some(p) => p,
                None => return json_error("Invalid JSON", StatusCode(400)),
            };
            let mut state = web_state.lock().unwrap();
            let idx = state.projects.iter().position(|p| p.id.as_deref() == Some(id));
            match idx {
                Some(i) => {
                    state.projects[i] = payload.clone();
                    save_web_state(&state);
                    json_response(&payload, StatusCode(200))
                }
                None => json_error("Project not found", StatusCode(404))
            }
        }
        ("DELETE", path) if path.starts_with("/api/projects/") => {
            let id = path.trim_start_matches("/api/projects/");
            let mut state = web_state.lock().unwrap();
            state.projects.retain(|p| p.id.as_deref() != Some(id));
            save_web_state(&state);
            json_response(&serde_json::json!({ "success": true }), StatusCode(200))
        }

        // ── Kanban ──
        ("GET", "/api/kanban/tasks") => {
            let state = web_state.lock().unwrap();
            json_response(&state.kanban_tasks, StatusCode(200))
        }
        ("POST", "/api/kanban/tasks") => {
            let mut payload: KanbanTaskPayload = match body.as_ref().and_then(|b| serde_json::from_str(b).ok()) {
                Some(p) => p,
                None => return json_error("Invalid JSON", StatusCode(400)),
            };
            let mut state = web_state.lock().unwrap();
            if payload.id.is_none() {
                payload.id = Some(nanoid::nanoid!());
            }
            state.kanban_tasks.push(payload.clone());
            save_web_state(&state);
            json_response(&payload, StatusCode(201))
        }
        ("PUT", path) if path.starts_with("/api/kanban/tasks/") => {
            let id = path.trim_start_matches("/api/kanban/tasks/");
            let payload: KanbanTaskPayload = match body.as_ref().and_then(|b| serde_json::from_str(b).ok()) {
                Some(p) => p,
                None => return json_error("Invalid JSON", StatusCode(400)),
            };
            let mut state = web_state.lock().unwrap();
            let idx = state.kanban_tasks.iter().position(|t| t.id.as_deref() == Some(id));
            match idx {
                Some(i) => {
                    state.kanban_tasks[i] = payload.clone();
                    save_web_state(&state);
                    json_response(&payload, StatusCode(200))
                }
                None => json_error("Task not found", StatusCode(404))
            }
        }
        ("DELETE", path) if path.starts_with("/api/kanban/tasks/") => {
            let id = path.trim_start_matches("/api/kanban/tasks/");
            let mut state = web_state.lock().unwrap();
            state.kanban_tasks.retain(|t| t.id.as_deref() != Some(id));
            save_web_state(&state);
            json_response(&serde_json::json!({ "success": true }), StatusCode(200))
        }

        // ── Tauri Command Proxies (browser mode) ──
        ("POST", "/api/system-health") => {
            json_response(&pty::system_health_inner(app_state), StatusCode(200))
        }
        ("POST", "/api/runtime-info") => {
            let args = parse_body();
            let shell_override = args.as_ref().and_then(|a| a.get("shell_override")).and_then(|v| v.as_str()).map(|s| s.to_string());
            json_response(&pty::runtime_info(shell_override), StatusCode(200))
        }
        ("POST", "/api/detect-installed-agents") => {
            let args = parse_body();
            let candidates: Vec<(String, String)> = args.as_ref()
                .and_then(|a| a.get("candidates"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            json_response(&pty::detect_installed_agents(candidates), StatusCode(200))
        }
        ("POST", "/api/list-processes") => {
            json_response(&pty::list_processes_inner(app_state), StatusCode(200))
        }
        ("POST", "/api/kill-process") => {
            let args = parse_body();
            let pid = args.as_ref().and_then(|a| a.get("pid")).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            match pty::kill_process(pid) {
                Ok(_) => json_response(&serde_json::json!({ "success": true }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/git-diff") => {
            let args = parse_body();
            let cwd = args.as_ref().and_then(|a| a.get("cwd")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::git_diff(cwd) {
                Ok(result) => json_response(&result, StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/git-diff-file") => {
            let args = parse_body();
            let cwd = args.as_ref().and_then(|a| a.get("cwd")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let path = args.as_ref().and_then(|a| a.get("path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::git_diff_file(cwd, path) {
                Ok(result) => json_response(&result, StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/git-branches") => {
            let args = parse_body();
            let cwd = args.as_ref().and_then(|a| a.get("cwd")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::git_branches(cwd) {
                Ok(result) => json_response(&result, StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/git-checkout-branch") => {
            let args = parse_body();
            let cwd = args.as_ref().and_then(|a| a.get("cwd")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let branch = args.as_ref().and_then(|a| a.get("branch")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::git_checkout_branch(cwd, branch) {
                Ok(_) => json_response(&serde_json::json!({ "success": true }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/git-status-count") => {
            let args = parse_body();
            let cwd = args.as_ref().and_then(|a| a.get("cwd")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::git_status_count(cwd) {
                Ok(result) => json_response(&result, StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/list-agency-agents") => {
            match pty::list_agency_agents() {
                Ok(result) => json_response(&result, StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/sync-project-agency-agent") => {
            let args = parse_body();
            let project_path = args.as_ref().and_then(|a| a.get("project_path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let slug = args.as_ref().and_then(|a| a.get("slug")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let enabled = args.as_ref().and_then(|a| a.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(false);
            let category = args.as_ref().and_then(|a| a.get("category")).and_then(|v| v.as_str()).map(|s| s.to_string());
            match pty::sync_project_agency_agent(project_path, slug, enabled, category) {
                Ok(result) => json_response(&result, StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/bootstrap-spec-kit") => {
            let args = parse_body();
            let project_path = args.as_ref().and_then(|a| a.get("project_path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let agent_id = args.as_ref().and_then(|a| a.get("agent_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::bootstrap_spec_kit(project_path, agent_id) {
                Ok(result) => json_response(&serde_json::json!({ "output": result }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/install-caveman") => {
            let args = parse_body();
            let agent_id = args.as_ref().and_then(|a| a.get("agent_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::install_caveman(agent_id) {
                Ok(result) => json_response(&serde_json::json!({ "output": result }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/open-in-file-manager") => {
            let args = parse_body();
            let path = args.as_ref().and_then(|a| a.get("path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::open_in_file_manager(path) {
                Ok(_) => json_response(&serde_json::json!({ "success": true }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/write-pty") => {
            let args = parse_body();
            let session_id = args.as_ref().and_then(|a| a.get("session_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let data: Vec<u8> = args.as_ref()
                .and_then(|a| a.get("data"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            match pty::write_pty_inner(&session_id, &data, app_state) {
                Ok(_) => json_response(&serde_json::json!({ "success": true }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/resize-pty") => {
            let args = parse_body();
            let session_id = args.as_ref().and_then(|a| a.get("session_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let cols = args.as_ref().and_then(|a| a.get("cols")).and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let rows = args.as_ref().and_then(|a| a.get("rows")).and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            match pty::resize_pty_inner(&session_id, cols, rows, app_state) {
                Ok(_) => json_response(&serde_json::json!({ "success": true }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/kill-pty") => {
            let args = parse_body();
            let session_id = args.as_ref().and_then(|a| a.get("session_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match pty::kill_pty_inner(&session_id, app_state) {
                Ok(_) => json_response(&serde_json::json!({ "success": true }), StatusCode(200)),
                Err(e) => json_error(&e, StatusCode(500)),
            }
        }
        ("POST", "/api/fs/read-dir") => {
            let args = parse_body();
            let path = args.as_ref().and_then(|a| a.get("path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match std::fs::read_dir(&path) {
                Ok(entries) => {
                    let items: Vec<_> = entries.filter_map(|e| {
                        let e = e.ok()?;
                        let meta = e.metadata().ok()?;
                        Some(serde_json::json!({
                            "name": e.file_name().to_string_lossy().to_string(),
                            "isDirectory": meta.is_dir(),
                            "isFile": meta.is_file(),
                        }))
                    }).collect();
                    json_response(&items, StatusCode(200))
                }
                Err(e) => json_error(&format!("Failed to read dir: {}", e), StatusCode(500))
            }
        }
        ("POST", "/api/fs/read-text-file") => {
            let args = parse_body();
            let path = args.as_ref().and_then(|a| a.get("path")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            match std::fs::read_to_string(&path) {
                Ok(contents) => json_response(&serde_json::json!({ "contents": contents }), StatusCode(200)),
                Err(e) => json_error(&format!("Failed to read file: {}", e), StatusCode(500))
            }
        }
        ("POST", "/api/spawn-pty") => {
            let args = parse_body();
            let session_id = args.as_ref().and_then(|a| a.get("session_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let command = args.as_ref().and_then(|a| a.get("command")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let args_list: Vec<String> = args.as_ref()
                .and_then(|a| a.get("args"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            let cwd = args.as_ref().and_then(|a| a.get("cwd")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let env: std::collections::HashMap<String, String> = args.as_ref()
                .and_then(|a| a.get("env"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            let cols = args.as_ref().and_then(|a| a.get("cols")).and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let rows = args.as_ref().and_then(|a| a.get("rows")).and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            let shell_override = args.as_ref().and_then(|a| a.get("shell_override")).and_then(|v| v.as_str()).map(|s| s.to_string());

            if let Some(ref ws) = ws_state {
                match crate::ws_server::spawn_pty_ws(
                    &session_id, command, args_list, cwd, env, cols, rows, shell_override, app_state, Arc::clone(ws),
                ) {
                    Ok(_) => json_response(&serde_json::json!({ "session_id": session_id }), StatusCode(200)),
                    Err(e) => json_error(&e, StatusCode(500)),
                }
            } else {
                json_error("WebSocket server not available", StatusCode(503))
            }
        }

        // ── Options (CORS preflight) ──
        ("OPTIONS", _) => {
            Response::from_data(vec![]).with_status_code(StatusCode(204))
        }

        _ => json_error("Not Found", StatusCode(404)),
    }
}
