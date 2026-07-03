# Nexus Onboarding

A 5-page full-screen onboarding overlay shown on first launch.

## Pages

1. **Welcome** — Nexus logo, tagline, and brief description
2. **Features** — 8-slide carousel showcasing all capabilities
3. **Theme** — Dark vs Light theme picker with live preview
4. **Kanban** — Choose Local Kanban or Planka Cloud with inline connection form
5. **Add Project** — Name, path, category, color, default agents, Spec Kit

## Usage

On first launch, `onboardingCompleted` is `false` in settings, so the `<Onboarding />` overlay renders instead of the main app. After completing all 5 pages and clicking "Finish" on page 5:

1. The project is created via `addProject()`
2. Kanban config (Planka or local) is applied
3. Agency agent sync runs if enabled
4. Spec Kit bootstrap runs if enabled
5. `onboardingCompleted` is set to `true` in settings
6. The main app renders normally

On subsequent launches, the onboarding is skipped entirely.

## Files

- `src/components/onboarding/Onboarding.tsx` — Container, context provider, page navigation, dots, arrows
- `src/components/onboarding/OnboardingPageWelcome.tsx` — Page 1
- `src/components/onboarding/OnboardingPageFeatures.tsx` — Page 2
- `src/components/onboarding/OnboardingPageTheme.tsx` — Page 3
- `src/components/onboarding/OnboardingPageKanban.tsx` — Page 4
- `src/components/onboarding/OnboardingPageProject.tsx` — Page 5
- `src/types/index.ts` — `onboardingCompleted` field in `AppSettings`
- `src/lib/persistence.ts` — `onboardingCompleted: false` default
- `src/App.tsx` — Conditional render + `handleOnboardingFinish` callback
