# Building Nexus for Windows

This guide covers Windows-specific build configuration, common issues, and how to produce Windows installers and portable executables.

---

## Prerequisites

### Building on Windows

- Windows 10/11
- [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (or full VS Community with "Desktop development with C++" workload)
- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/)
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 11; the installer will prompt on Windows 10 if missing)

### Cross-compiling from Linux

Cross-compiling Windows **NSIS installers** from Linux is supported with caveats. You **cannot** build `.msi` installers on Linux (WiX is Windows-only).

Required packages:
- `nsis`
- `lld`
- `llvm`
- `cargo-xwin`

**Arch Linux:**
```bash
sudo pacman -S lld llvm clang
yay -S nsis
cargo install --locked cargo-xwin
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install -y nsis lld llvm
cargo install --locked cargo-xwin
```

---

## Quick Build

### On Windows (Native)

From the project root on a Windows machine:

```powershell
npm install
npm run build
cargo tauri build
```

After a successful build, artifacts are placed at:

```
src-tauri/target/release/bundle/msi/Nexus_0.1.7_x64_en-US.msi
src-tauri/target/release/bundle/nsis/Nexus_0.1.7_x64-setup.exe
src-tauri/target/release/nexus.exe                    # portable raw binary
```

### On Linux (Cross-compile)

Only **NSIS** (`.exe` installer) and the **portable binary** can be built. `.msi` requires Windows.

```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm install
npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc
```

Output:
```
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Nexus_0.1.7_x64-setup.exe
src-tauri/target/x86_64-pc-windows-msvc/release/nexus.exe    # portable raw binary
```

> **Note:** The first build downloads the Windows MSVC CRT and SDKs via `cargo-xwin` (~50MB). Subsequent builds reuse cached files.

---

## Release Artifacts

We distribute two Windows artifacts:

| Artifact | File | Size | Use Case |
|---|---|---|---|
| **Portable executable** | `nexus-windows-x86_64.exe` | ~13 MB | No installation. Double-click to run. Requires WebView2 pre-installed. |
| **NSIS Installer** | `Nexus_0.1.7_x64-setup.exe` | ~4.5 MB | Full installer. Auto-installs WebView2 if missing. |

### Portable Executable

The raw binary (`src-tauri/target/.../release/nexus.exe`) is a fully self-contained Windows GUI application. It does **not** bundle WebView2 — the runtime must already exist on the user's machine. Most Windows 11 systems and recent Windows 10 systems have WebView2 pre-installed.

### NSIS Installer

The installer is configured with:
- `installMode: "both"` — installs per-user (no admin required) by default, but offers an elevation prompt for system-wide installation.
- `displayLanguageSelector: false` — single-language installer (English).
- `embedBootstrapper` — bundles the WebView2 bootstrapper inside the installer so it can install WebView2 offline.

---

## Windows-Specific Configuration

### Console Window Hidden

The app is compiled with the Windows **GUI subsystem**, so no terminal / PowerShell window pops up when users double-click the `.exe`. This is controlled in `src-tauri/src/main.rs`:

```rust
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
```

> **Note:** If you need to see stdout/stderr while developing on Windows, launch the binary from an existing PowerShell or CMD window instead of double-clicking it.

### WebView2 Bootstrapper

Nexus uses **Tauri v2**, which on Windows relies on the system **WebView2** runtime (the same engine that powers Microsoft Edge). If a user's machine does not have WebView2 installed, the app will fail to start.

The Windows bundle supports several WebView2 installation modes:

| Mode | Bundled Size | Internet Required | Behavior |
|---|---|---|---|
| `embedBootstrapper` | ~+1.8 MB | No (at install time) | Bundles the bootstrapper. Installs WebView2 silently during setup. |
| `downloadBootstrapper` | 0 MB | Yes (at install time) | Installer downloads WebView2 bootstrapper from Microsoft. |
| `offlineInstaller` | ~+127 MB | No | Bundles the full offline installer. Largest but most reliable. |
| `skip` | 0 MB | No | Does not install WebView2. App crashes if it's missing. |

Current config (`tauri.conf.json`):

```json
"bundle": {
  "windows": {
    "webviewInstallMode": {
      "type": "embedBootstrapper"
    }
  }
}
```

---

## Common Issues & Fixes

### Installer hangs at "Installing WebView2..."

**Cause:** The WebView2 bootstrapper inside the installer is trying to download additional components from Microsoft, but the machine is offline, behind a firewall, or the download is very slow.

**Fix:** Use the **portable executable** (`nexus-windows-x86_64.exe`) instead. It does not attempt to install WebView2. Ensure WebView2 is already installed on the machine (most modern Windows systems have it).

### "WebKitWebProcess2 not found"

**Cause:** `WebKitWebProcess2` is a **Linux/macOS** component from WebKitGTK. If you see this error on Windows, it means one of the following:

1. **You are running a Linux build on Windows** (e.g., copied the `.deb`, `.rpm`, or `AppImage` to a Windows machine). Windows requires the `.msi`, `.exe` installer, or portable `.exe` built for Windows.
2. **You are building inside WSL** and trying to run the resulting binary on Windows. WSL produces Linux ELF binaries, not Windows PE executables.

**Fix:** Build natively on Windows (or cross-compile from Linux with `cargo-xwin`) and distribute the correct Windows artifacts.

### Terminal / PowerShell window opens and then closes

**Cause:** The executable was built as a **console subsystem** application instead of a **Windows subsystem** application.

**Fix:** Ensure `src-tauri/src/main.rs` contains:

```rust
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
```

This is already present in the current codebase. If you still see a console, you may be running a **debug** build (`cargo tauri dev` or `cargo build`) instead of a **release** build (`cargo tauri build`).

### App launches but shows a blank white window

**Cause:** WebView2 Runtime is missing or corrupted on the target machine.

**Fix:** If using the installer, the `embedBootstrapper` setting handles this automatically. If using the portable executable, manually install WebView2 from:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### Build fails with linker errors

**Cause:** Missing Visual C++ build tools (Windows) or missing `lld`/`llvm` (Linux cross-compile).

**Fix:**
- **Windows:** Install the "Desktop development with C++" workload from Visual Studio Build Tools. You need:
  - MSVC v143 (or latest)
  - Windows SDK
  - C++ CMake tools (optional but recommended)
- **Linux:** Install `lld` and `llvm`:
  ```bash
  # Arch
  sudo pacman -S lld llvm
  # Ubuntu
  sudo apt install lld llvm
  ```

---

## Sources

- Tauri v2 Windows Installer Docs: https://tauri.app/distribute/windows-installer/
- Tauri v2 Windows Bundle Config: https://tauri.app/reference/config/#bundleconfigwindows
- WebView2 Runtime: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
- Microsoft C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- `cargo-xwin`: https://github.com/cross-rs/cargo-xwin
