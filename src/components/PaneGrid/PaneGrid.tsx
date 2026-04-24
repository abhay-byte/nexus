import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cloneLayout, normalizeFractions } from "../../lib/layout";
import { useSessionStore } from "../../store/sessionStore";
import type { Project } from "../../types";
import { Pane } from "./Pane";

interface PaneGridProps {
  project: Project | null;
  /** The active terminal tab's ID — used as the key into layouts and activePaneIds. */
  layoutKey: string;
  /** True when this tab is currently visible. Used to re-fit xterm after tab switch. */
  isTabActive: boolean;
  onLaunchAgent: (agentId: string, paneId?: string) => void;
  onLaunchShell: (paneId?: string) => void;
}

export function PaneGrid({ project, layoutKey, isTabActive, onLaunchAgent, onLaunchShell }: PaneGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const layouts = useSessionStore((state) => state.layouts);
  const sessions = useSessionStore((state) => state.sessions);
  const activePaneIds = useSessionStore((state) => state.activePaneIds);
  const paneAttention = useSessionStore((state) => state.paneAttention);
  const customAgents = useSessionStore((state) => state.settings.customAgents);
  const focusPane = useSessionStore((state) => state.focusPane);
  const setPaneFractions = useSessionStore((state) => state.setPaneFractions);
  const ensureLayout = useSessionStore((state) => state.ensureLayout);

  // Self-heal: if this tab has no layout yet, create one.
  useEffect(() => {
    if (project && !layouts[layoutKey]) {
      ensureLayout(project.id);
    }
  }, [project, layoutKey, layouts, ensureLayout]);

  const rawLayout = useMemo(
    () => (project ? layouts[layoutKey] ?? null : null),
    [layouts, layoutKey, project],
  );
  const layout = useMemo(
    () => (rawLayout ? cloneLayout(rawLayout) : null),
    [rawLayout],
  );

  if (!project || !layout) {
    return null;
  }


  const rowFractions = normalizeFractions(layout.rowFractions ?? Array(layout.rows).fill(1));
  const colFractions = normalizeFractions(layout.colFractions ?? Array(layout.cols).fill(1));

  const beginDrag =
    (orientation: "horizontal" | "vertical") => (event: ReactPointerEvent) => {
    if (!gridRef.current || !(orientation === "horizontal" ? layout.rows > 1 : layout.cols > 1)) {
      return;
    }

    const grid = gridRef.current;
    const rect = grid.getBoundingClientRect();

    const onMove = (moveEvent: PointerEvent) => {
      if (orientation === "vertical") {
        const x = Math.min(Math.max(moveEvent.clientX - rect.left, 80), rect.width - 80);
        const next = normalizeFractions([x / rect.width, 1 - x / rect.width]);
        setPaneFractions(project.id, "vertical", next);
      } else {
        const y = Math.min(Math.max(moveEvent.clientY - rect.top, 80), rect.height - 80);
        const next = normalizeFractions([y / rect.height, 1 - y / rect.height]);
        setPaneFractions(project.id, "horizontal", next);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    event.preventDefault();
  };

  return (
    <div className="pane-grid-wrapper">
      <div
        className="pane-grid"
        ref={gridRef}
        style={{
          gridTemplateColumns: colFractions.map((value) => `${value}fr`).join(" "),
          gridTemplateRows: rowFractions.map((value) => `${value}fr`).join(" "),
        }}
      >
        {layout.panes.map((pane) => (
          <div
            key={pane.id}
            style={{
              gridColumn: pane.col + 1,
              gridRow: pane.row + 1,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <Pane
              pane={pane}
              project={project}
              active={activePaneIds[layoutKey] === pane.id}
              attention={paneAttention[pane.id] ?? false}
              session={pane.sessionId ? sessions[pane.sessionId] ?? null : null}
              customAgents={customAgents}
              isTabActive={isTabActive}
              onFocus={() => focusPane(project.id, pane.id)}
              onLaunchAgent={onLaunchAgent}
              onLaunchShell={onLaunchShell}
            />
          </div>
        ))}
        {layout.cols > 1 ? (
          <div
            className="pane-grid__divider pane-grid__divider--vertical"
            onPointerDown={beginDrag("vertical")}
            style={{
              left: `${colFractions[0] * 100}%`,
            }}
          />
        ) : null}
        {layout.rows > 1 ? (
          <div
            className="pane-grid__divider pane-grid__divider--horizontal"
            onPointerDown={beginDrag("horizontal")}
            style={{
              top: `${rowFractions[0] * 100}%`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
