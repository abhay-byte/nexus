export interface KeybindingAction {
  id: string;
  label: string;
  defaultBinding: string | null;
  category: string;
}

export const KEYBINDING_ACTIONS: KeybindingAction[] = [
  { id: "quit", label: "Quit Application", defaultBinding: "Ctrl+Q", category: "Application" },
  { id: "toggleSidebar", label: "Toggle Sidebar", defaultBinding: "Ctrl+B", category: "Application" },
  { id: "toggleProjectPanel", label: "Toggle Project Files Panel", defaultBinding: "Ctrl+Shift+E", category: "Application" },
  { id: "toggleGitDiff", label: "Toggle Git Diff Panel", defaultBinding: "Ctrl+Shift+G", category: "Application" },
  { id: "toggleSettings", label: "Toggle Settings", defaultBinding: "Ctrl+,", category: "Application" },
  { id: "toggleSearch", label: "Toggle Log Search", defaultBinding: "Ctrl+Shift+F", category: "Application" },
  { id: "nextProjectTab", label: "Next Project Tab", defaultBinding: "Ctrl+Tab", category: "Navigation" },
  { id: "prevProjectTab", label: "Previous Project Tab", defaultBinding: "Ctrl+Shift+Tab", category: "Navigation" },
  { id: "newTerminalTab", label: "New Terminal Tab", defaultBinding: "Ctrl+Shift+T", category: "Terminal" },
  { id: "closeTerminalTab", label: "Close Terminal Tab", defaultBinding: "Ctrl+Shift+W", category: "Terminal" },
  { id: "splitVertical", label: "Split Pane Vertically", defaultBinding: "Ctrl+Shift+D", category: "Terminal" },
  { id: "splitHorizontal", label: "Split Pane Horizontally", defaultBinding: "Ctrl+Shift+H", category: "Terminal" },
  { id: "killFocusedSession", label: "Kill Focused Session", defaultBinding: "Ctrl+Shift+X", category: "Terminal" },
  { id: "zoomIn", label: "Zoom In Terminal", defaultBinding: "Ctrl+Plus", category: "Terminal" },
  { id: "zoomOut", label: "Zoom Out Terminal", defaultBinding: "Ctrl+Minus", category: "Terminal" },
];

export function getDefaultKeybindings(): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const action of KEYBINDING_ACTIONS) {
    map[action.id] = action.defaultBinding;
  }
  return map;
}

export function parseKeybinding(binding: string): {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  code: string;
} {
  const parts = binding.split(/\+/);
  const key = parts[parts.length - 1];
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
  return {
    ctrl: parts.includes("Ctrl"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
    meta: parts.includes("Meta"),
    code,
  };
}

export function matchesKeybinding(
  event: KeyboardEvent,
  binding: string | null | undefined,
): boolean {
  if (!binding) return false;
  const parsed = parseKeybinding(binding);
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.metaKey !== parsed.meta) return false;
  if (event.code !== parsed.code) return false;
  return true;
}
