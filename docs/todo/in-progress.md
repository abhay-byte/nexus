---
- id: T2
  title: Terminal focus lost on project switch and first CLI tool run
  type: bug
  priority: critical
  difficulty: unknown
  frequency: always
  expected: Terminal auto-focuses when switching projects or when a CLI tool starts for the first time
  actual: |
    Two symptoms:
    1. Switching to a different project does not focus the terminal in that project — user must click to focus
    2. Running a CLI tool for the first time starts with terminal unfocused — user must click to focus
    Only works correctly when switching terminal tabs within the same project.
  reproduction: |
    Symptom 1:
    1. Open project A, terminal is focused
    2. Switch to project B
    3. Terminal in project B is not focused — must click

    Symptom 2:
    1. Open nexus, navigate to terminal
    2. Run any CLI tool for the first time
    3. Terminal output appears but terminal is not focused — must click
  impact: Blocks interactive terminal work across projects; requires manual click every time
  images: null
  github_ref: null
  plan: |
    Root cause: useEffect([active, isTabActive]) doesn't re-fire on project switch
    because isTabActive is per-project, not per-app. Both projects keep isTabActive=true.
    Fix: Add isProjectActive prop from App.tsx → PaneGrid → Pane → TerminalView.
    Add to focus useEffect deps so it re-triggers on project switch.
    4 files: App.tsx, PaneGrid.tsx, Pane.tsx, TerminalView.tsx.
---
