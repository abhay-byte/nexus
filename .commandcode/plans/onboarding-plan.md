# Onboarding Plan — Nexus Terminal

## Overview

A 5-page full-screen onboarding overlay that runs on first launch. Each page teaches a feature or collects setup preferences. After completion, the `onboardingCompleted` flag is set and the app opens normally with all chosen settings applied.

## Pages Flow

```
Page 1: Welcome → Page 2: Features Slideshow → Page 3: Theme Picker → Page 4: Kanban Setup → Page 5: Add First Project → Finish
```

---

## State Management

Add `onboardingCompleted: boolean` (default `false`) to `AppSettings` in `src/types/index.ts` and `DEFAULT_SETTINGS` in `src/lib/persistence.ts`. Persists via existing Zustand → disk pipeline.

On startup, if `onboardingCompleted === false`, render `<Onboarding />` overlay instead of main app. After finish, call `updateSettings({ onboardingCompleted: true })` → main app renders.

---

## Component Architecture

```
<Onboarding />                         ← fixed inset-0, z-[100], full-screen bg-[#0d0d0d]
├── Page indicator dots                ← bottom center, 5 dots, active=#ffcc00
├── <OnboardingPageWelcome />          ← Page 0: logo + tagline
├── <OnboardingPageFeatures />         ← Page 1: 8-slide feature carousel
├── <OnboardingPageTheme />            ← Page 2: dark vs light theme picker
├── <OnboardingPageKanban />           ← Page 3: local vs Planka setup
├── <OnboardingPageProject />          ← Page 4: add first project
├── Left arrow button                  ← prev page (hidden on page 0)
└── Right/Finish button                ← next page / finish on page 4
```

All 5 pages rendered simultaneously, only active one visible. Preserves form state across navigation.

---

## New Files (6)

### `src/components/onboarding/Onboarding.tsx`
Container: `currentPage` state (0–4), page dots, nav buttons, `OnboardingContext` provider.

### `src/components/onboarding/OnboardingPageWelcome.tsx`
Nexus icon, "Nexus Terminal" heading, "Multi-Agent AI Terminal Workspace" tagline.

### `src/components/onboarding/OnboardingPageFeatures.tsx`
8 slide carousel: Multi-Agent Runner, Split Panes, Kanban Boards, Planka Cloud Sync, Git Diff Panel, File Explorer, AI Agency Personalities, MCP Servers & Skills. Auto-progress 5s.

### `src/components/onboarding/OnboardingPageTheme.tsx`
Two large cards: Dark / Light. Selected gets `#ffcc00` border + scale. Applies theme immediately via `updateSettings()`.

### `src/components/onboarding/OnboardingPageKanban.tsx`
Two cards: Local Kanban / Planka Cloud Kanban. Planka expands inline form: URL, email, password, "Test Connection" button. Pre-fills existing config.

### `src/components/onboarding/OnboardingPageProject.tsx`
Name, path, category, color swatches, default agents checkboxes, spec-kit checkbox. On finish: creates project, applies kanban config, runs agency+specKit async, sets `onboardingCompleted: true`.

---

## Files to Modify (3)

- **`src/types/index.ts`** — add `onboardingCompleted: boolean` to `AppSettings`
- **`src/lib/persistence.ts`** — add `onboardingCompleted: false` to `DEFAULT_SETTINGS`
- **`src/App.tsx`** — conditionally render `<Onboarding />` if `!settings.onboardingCompleted`

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No agents installed | Message with install links |
| Restart mid-onboarding | Resumes from page 1 (no partial state) |
| Web server mode | File picker → text input |
| Planka connection fails | Red error, continue without Planka |
| Second launch | Onboarding skipped entirely |

---

## Verification Checklist

1. Fresh install → onboarding shows page 1 with logo
2. Arrows navigate pages, dots update, left arrow hidden on page 1
3. Dark/Light theme changes onboarding colors immediately
4. Feature slideshow: arrows cycle 8 slides, auto-progress works
5. Local Kanban selected → proceeds to page 5
6. Planka: fill form → Test Connection → green checkmark → proceed
7. Planka error: bad credentials → red error → continue with local
8. Project: fill name+path → Finish → project created, main app loads
9. Second launch: onboarding skipped
10. Clearing app data re-triggers onboarding
