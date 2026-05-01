# Release Workflow

Automated release pipeline for Nexus desktop application.

## Trigger

Manual execution when a new version is ready for distribution.

## Prerequisites

- All tests pass (`cargo check`, `npx tsc --noEmit`)
- Version bumped in:
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src/components/Sidebar/Sidebar.tsx`
  - `src/components/StatusBar/StatusBar.tsx`
- `docs/release_notes/v{VERSION}.md` written
- All features merged to `master`

## Steps

### 1. Version Bump

Update all version strings across the codebase:

```bash
# Frontend
sed -i 's/"version": "OLD"/"version": "NEW"/' package.json

# Rust backend
sed -i 's/version = "OLD"/version = "NEW"/' src-tauri/Cargo.toml

# Tauri config
sed -i 's/"version": "OLD"/"version": "NEW"/' src-tauri/tauri.conf.json

# UI labels
sed -i 's/vOLD/vNEW/' src/components/Sidebar/Sidebar.tsx
sed -i 's/VOLD/VNEW/' src/components/StatusBar/StatusBar.tsx
```

### 2. Build Release Artifacts

```bash
npm run build
cargo tauri build
```

Expected outputs:
| Artifact | Path |
|----------|------|
| Debian package | `src-tauri/target/release/bundle/deb/Nexus_{VERSION}_amd64.deb` |
| RPM package | `src-tauri/target/release/bundle/rpm/Nexus-{VERSION}-1.x86_64.rpm` |
| AppImage | `src-tauri/target/release/bundle/appimage/Nexus_{VERSION}_amd64.AppImage` (may fail in Docker) |
| Raw binary | `src-tauri/target/release/nexus` |

Create tarball:
```bash
cd src-tauri/target/release
mkdir -p nexus-linux-x64
cp nexus nexus-linux-x64/
tar -czvf ../../../Nexus_linux_x64.tar.gz nexus-linux-x64
```

### 3. Stage Artifacts

```bash
mkdir -p releases/v{VERSION}
cp src-tauri/target/release/bundle/deb/Nexus_{VERSION}_amd64.deb releases/v{VERSION}/
cp src-tauri/target/release/bundle/rpm/Nexus-{VERSION}-1.x86_64.rpm releases/v{VERSION}/
cp Nexus_linux_x64.tar.gz releases/v{VERSION}/
cp src-tauri/target/release/nexus releases/v{VERSION}/nexus-linux-x86_64
```

### 4. Write Release Notes

Create `docs/release_notes/v{VERSION}.md` following the template:

```markdown
# Nexus v{VERSION}

<img src="https://github.com/abhay-byte/nexus/raw/v{VERSION}/src-tauri/icons/icon.png" width="128" height="128" alt="Nexus Logo">

## Downloads

### Linux
| Format | File | Size |
|---|---|---|
| Debian/Ubuntu (x86_64) | `Nexus_{VERSION}_amd64.deb` | {SIZE} |
| RHEL/Fedora (x86_64) | `Nexus-{VERSION}-1.x86_64.rpm` | {SIZE} |
| Tarball (x86_64) | `Nexus_linux_x64.tar.gz` | {SIZE} |
| Raw binary (x86_64) | `nexus-linux-x86_64` | {SIZE} |

## Changelog
- ...
```

### 5. Commit and Tag

```bash
git add -A
git commit -m "release: v{VERSION}"
git tag v{VERSION}
git push origin master
git push origin v{VERSION}
```

### 6. Create GitHub Release

```bash
gh release create v{VERSION} \
  --title "Nexus v{VERSION}" \
  --notes-file docs/release_notes/v{VERSION}.md \
  releases/v{VERSION}/Nexus_{VERSION}_amd64.deb \
  releases/v{VERSION}/Nexus-{VERSION}-1.x86_64.rpm \
  releases/v{VERSION}/Nexus_linux_x64.tar.gz \
  releases/v{VERSION}/nexus-linux-x86_64
```

### 7. Update Local Installation (Arch Linux)

```bash
# If installed from raw binary
sudo cp releases/v{VERSION}/nexus-linux-x86_64 /usr/local/bin/nexus
sudo chmod +x /usr/local/bin/nexus

# If installed from .deb via debtap or similar
sudo pacman -U ./Nexus_{VERSION}_amd64.deb

# Verify
nexus --version
```

## Post-Release Checklist

- [ ] Release page is public: `https://github.com/abhay-byte/nexus/releases/tag/v{VERSION}`
- [ ] All four artifacts are attached to the release
- [ ] Local installation updated and tested
- [ ] Update `docs/building-windows.md` if Windows-specific changes were made
- [ ] Announce in relevant channels if applicable

## Troubleshooting

### AppImage build fails
Expected in Docker / cross-compile environments. The `.deb` and `.rpm` are still valid.

### Permission denied on binary
```bash
chmod +x releases/v{VERSION}/nexus-linux-x86_64
```

### WebView2 missing on Windows
Ensure `tauri.conf.json` contains:
```json
"windows": {
  "webviewInstallMode": {
    "type": "embedBootstrapper"
  }
}
```

## Sources

- Tauri Bundle Docs: https://tauri.app/v2/references/config/#bundleconfig
- GitHub CLI Releases: https://cli.github.com/manual/gh_release_create
