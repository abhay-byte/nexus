#!/usr/bin/env bash
set -e

echo "Starting ARM64 Docker build..."
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
        
        echo "Building frontend..."
        npm install --silent
        npm run build
        
        echo "Building Tauri artifacts..."
        cargo tauri build
        
        echo "Building headless binary..."
        cd src-tauri
        cargo build --release --bin nexus-headless
        cd ..
        
        echo "Packaging tarball..."
        mkdir -p dist/release/nexus-linux-arm64
        cp src-tauri/target/release/nexus dist/release/nexus-linux-arm64/
        tar -C dist/release -czvf dist/release/Nexus_linux_arm64.tar.gz nexus-linux-arm64
        
        echo "Copying outputs..."
        cp src-tauri/target/release/bundle/deb/Nexus_0.2.0_arm64.deb dist/release/
        cp src-tauri/target/release/bundle/rpm/Nexus-0.2.0-1.aarch64.rpm dist/release/
        cp src-tauri/target/release/nexus dist/release/nexus-linux-arm64-bin
        cp src-tauri/target/release/nexus-headless dist/release/nexus-headless-linux-arm64
        
        echo "Done!"
    '

sudo chown -R $USER:$USER dist/release/
sudo rm -rf .cargo-cache
