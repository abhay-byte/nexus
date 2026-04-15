# Building Nexus for ARM64 Linux

This guide explains how to cross-compile Nexus for ARM64 (aarch64) Linux from an x86_64 host using Docker.

## Prerequisites

- Docker installed and running
- Git

## Quick Build

Run the following command from the project root:

```bash
sudo docker run --rm -v "$(pwd):/workspace" -w /workspace \
    --platform linux/arm64 \
    --network host \
    -e CARGO_HOME=/workspace/.cargo-cache \
    node:20-bookworm \
    bash -c '
        set -e
        echo "Installing Rust..."
        curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
        export PATH="/workspace/.cargo-cache/bin:$PATH"
        
        echo "Installing Tauri dependencies..."
        apt-get update -qq && apt-get install -y -qq \
            libgtk-3-dev \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            libsoup-3.0-dev \
            libjavascriptcoregtk-4.1-dev \
            file \
            patchelf \
            > /dev/null 2>&1
        
        echo "Installing Tauri CLI..."
        cargo install tauri-cli --version "^2.0.0" --quiet
        
        echo "Building..."
        npm install --silent
        npm run build
        cargo tauri build
        
        echo "Done! Artifacts in src-tauri/target/release/bundle/"
    '
```

## Output Artifacts

After a successful build, you'll find:

| Artifact | Location |
|----------|----------|
| Debian package | `src-tauri/target/release/bundle/deb/Nexus_0.1.2_arm64.deb` |
| RPM package | `src-tauri/target/release/bundle/rpm/Nexus-0.1.2-1.aarch64.rpm` |
| Binary | `src-tauri/target/release/nexus` |

## Creating a Tarball

```bash
cd src-tauri/target/release
mkdir -p nexus-linux-arm64
cp nexus nexus-linux-arm64/
tar -czvf ../../../Nexus_linux_arm64.tar.gz nexus-linux-arm64
```

## Cleanup

The Docker build creates a `.cargo-cache` directory with root permissions. Clean it up with:

```bash
sudo rm -rf .cargo-cache
```

## Troubleshooting

### AppImage build fails

AppImage bundling may fail in the Docker environment. This is expected - the `.deb` and `.rpm` packages are still created successfully.

### Permission denied errors

Files created by Docker are owned by root. Use `sudo` to remove them.

### Network issues in Docker

If you encounter network errors, try adding `--network host` to the Docker command.

## Why Docker?

Cross-compiling Tauri apps requires ARM64 versions of GTK, WebKitGTK, and other system libraries. These aren't readily available on Arch Linux or most x86_64 distributions. Docker with `--platform linux/arm64` provides a native ARM64 environment with all dependencies.
