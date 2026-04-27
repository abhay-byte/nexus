# Building Nexus for Windows

This guide covers Windows-specific build configuration, common issues, and how to produce a proper Windows installer (.msi / .exe).

---

## Prerequisites

- Windows 10/11
- [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (or full VS Community with "Desktop development with C++" workload)
- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/)
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 11; the installer will prompt on Windows 10 if missing)

---

## Quick Build

From the project root on a Windows machine:

```powershell
npm install
npm run build
cargo tauri build
```

After a successful build, the installer is placed at:

```
src-tauri/target/release/bundle/msi/Nexus_0.1.6_x64_en-US.msi
src-tauri/target/release/bundle/nsis/Nexus_0.1.6_x64-setup.exe
```

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

To prevent this, the Windows bundle is configured to **embed the WebView2 bootstrapper** inside the installer:

```json
"bundle": {
  "windows": {
    "webviewInstallMode": {
      "type": "embedBootstrapper"
    }
  }
}
```

Behavior:
- The installer checks whether WebView2 is present.
- If missing, it silently downloads and installs the runtime before completing the app installation.
- The user does not need to manually install WebView2.

### NSIS Installer

The NSIS `.exe` installer is configured with:
- `installMode: "both"` — installs per-user (no admin required) by default, but offers an elevation prompt if the user chooses a system-wide directory.
- `displayLanguageSelector: false` — single-language installer (English).

---

## Common Issues & Fixes

### "WebKitWebProcess2 not found"

**Cause:** `WebKitWebProcess2` is a **Linux/macOS** component from WebKitGTK. If you see this error on Windows, it means one of the following:

1. **You are running a Linux build on Windows** (e.g., copied the `.deb`, `.rpm`, or `AppImage` to a Windows machine). Windows requires the `.msi` or `.exe` installer built on Windows (or cross-compiled with the correct Windows toolchain).
2. **You are building inside WSL** and trying to run the resulting binary on Windows. WSL produces Linux ELF binaries, not Windows PE executables.

**Fix:** Build natively on Windows (or in a Windows VM) and distribute the `.msi` or `setup.exe` from `src-tauri/target/release/bundle/`.

### Terminal / PowerShell window opens and then closes

**Cause:** The executable was built as a **console subsystem** application instead of a **Windows subsystem** application.

**Fix:** Ensure `src-tauri/src/main.rs` contains:

```rust
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
```

This is already present in the current codebase. If you still see a console, you may be running a **debug** build (`cargo tauri dev` or `cargo build`) instead of a **release** build (`cargo tauri build`). Debug builds on older Tauri templates sometimes showed a console; this project now forces the GUI subsystem unconditionally on Windows.

### App launches but shows a blank white window

**Cause:** WebView2 Runtime is missing or corrupted on the target machine.

**Fix:** The `embedBootstrapper` setting in `tauri.conf.json` handles this automatically during installation. If you are running the raw `.exe` without the installer, manually install WebView2 from:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### Build fails with linker errors

**Cause:** Missing Visual C++ build tools.

**Fix:** Install the "Desktop development with C++" workload from Visual Studio Build Tools. You need:
- MSVC v143 (or latest)
- Windows SDK
- C++ CMake tools (optional but recommended)

---

## Cross-Compilation Note

Cross-compiling a Tauri v2 app from Linux to Windows is **not officially supported** because Tauri depends on platform-specific toolchains (MSVC, Windows SDK, WebView2). Always build Windows installers on a Windows host or inside a Windows VM / GitHub Actions `windows-latest` runner.

---

## Sources

- Tauri v2 Windows Bundle Docs: https://tauri.app/v2/references/config/#bundleconfigwindows
- WebView2 Runtime: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
- Microsoft C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
