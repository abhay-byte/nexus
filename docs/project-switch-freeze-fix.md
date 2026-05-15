# Project Switch Freeze Fix — Technical Reference

> Fixes UI freeze when switching projects and launching an agent in the terminal (regression from v0.1.8).

## Symptoms

- App freezes completely when switching to a second project (e.g. fluxlinux) and clicking any agent to run in the terminal
- Browser console shows: `Warning: Maximum update depth exceeded. This can happen when a component calls setState inside useEffect...`
- Project directory panel (file tree sidebar) refreshes on every keystroke typed into a terminal
- First project works fine; freeze only occurs after switching to a different project

## Root Cause: Infinite Re-render Loop

The freeze was caused by a **circular state update loop** between three React effects in `App.tsx` and two Zustand stores:

```
┌─── Session created (launchAgent) ──────────────────────┐
│                                                         │
▼                                                         │
sessions object changes (new session added)               │
│                                                         │
▼                                                         │
bumpProjectToTop effect fires                             │
  (depends on `sessions`)                                 │
│                                                         │
▼                                                         │
projectStore.bumpProjectToTop() runs                      │
  → creates new `projects` array (new sortOrder)          │
│                                                         │
▼                                                         │
syncProjects effect fires                                 │
  (depends on `projects`)                                 │
│                                                         │
▼                                                         │
sessionStore.syncProjects() runs                          │
  → ALWAYS creates new object refs via Object.fromEntries │
  → new `sessions` ref (same data, different reference)   │
│                                                         │
└─── bumpProjectToTop sees "new" sessions ────────────────┘
     ∞ INFINITE LOOP
```

### Why it only triggered on the second project

On the first project, `bumpProjectToTop` is a no-op because `target.sortOrder <= minOrder` (it's already at the top). On the **second** project, the sort order is higher, so `bumpProjectToTop` actually modifies the projects array — which kicks off the infinite cycle.

## Fix 1: `syncProjects` early return (sessionStore.ts)

The core fix adds a guard at the top of `syncProjects` that checks whether any state actually needs to change before creating new objects. If all projects are already tracked and no stale sessions/tabs exist, it returns `state` unchanged — preserving object reference identity and breaking the re-render cascade.

```typescript
syncProjects: (projects) =>
  set((state) => {
    const validProjectIds = new Set(projects.map((p) => p.id));

    // Early return: if nothing changed, preserve object references
    const allProjectsTracked = projects.every(
      (p) => state.terminalTabs[p.id]?.length && state.activeTabIds[p.id],
    );
    const noStaleProjects = [...Object.keys(state.terminalTabs)]
      .every((id) => validProjectIds.has(id));
    const noStaleSessions = Object.values(state.sessions)
      .every((s) => validProjectIds.has(s.projectId));

    if (allProjectsTracked && noStaleProjects && noStaleSessions) {
      return state; // No new object references → no re-render
    }

    // ... existing filtering logic (only runs when needed)
  }),
```

## Fix 2: Stable directory panel deps (ProjectDirectoryPanel.tsx)

The `ProjectDirectoryPanel` component's `load` callback depended on the entire `project` object. Since `bumpProjectToTop` creates a new project object reference (with updated `sortOrder`), this caused the **directory tree to reload from disk on every keystroke**.

```diff
- const load = useCallback(async () => {
-   if (!project) return;
-   const root = project.path.replace(...);
-   ...
- }, [project]);  // ← unstable: new object on every sortOrder change

+ const projectPath = project?.path ?? null;
+ const load = useCallback(async () => {
+   if (!projectPath) return;
+   const root = projectPath.replace(...);
+   ...
+ }, [projectPath]);  // ← stable: string doesn't change
```

## Fix 3: `default-run` in Cargo.toml

The v0.1.8 refactor added a second binary target (`nexus-headless`) but didn't specify `default-run`, causing `cargo run` (used by `tauri dev`) to fail with:

```
error: `cargo run` could not determine which binary to run.
```

Fixed by adding `default-run = "nexus"` to `Cargo.toml`.

## Files Modified

| File | Change |
|------|--------|
| `src/store/sessionStore.ts` | Added early-return guard in `syncProjects` to prevent unnecessary state object recreation |
| `src/components/ProjectDirectoryPanel/ProjectDirectoryPanel.tsx` | Changed `load` callback dependency from `project` (object) to `project.path` (string) |
| `src-tauri/Cargo.toml` | Added `default-run = "nexus"` for multi-binary builds |

## Testing

| Scenario | What to verify |
|----------|----------------|
| Switch to second project, click agent | No freeze, terminal starts normally |
| Type in terminal on second project | Directory panel does NOT refresh/flicker |
| Open console while using second project | No "Maximum update depth exceeded" warnings |
| Add/remove projects | `syncProjects` still correctly cleans up stale state |
| `npx tauri dev` | Builds and runs without `cargo run` ambiguity error |

## Key Lesson

When using Zustand with React `useEffect`, **always ensure `set()` returns the existing `state` object when nothing has changed**. `Object.fromEntries()` / spread operators create new references even with identical data, which React treats as state changes — leading to cascading re-render loops when multiple effects depend on each other's output.
