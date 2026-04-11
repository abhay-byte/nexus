import { nanoid } from "nanoid";
import type { Pane, ProjectLayout } from "../types";

export function createPane(row: number, col: number): Pane {
  return {
    id: nanoid(),
    sessionId: null,
    row,
    col,
  };
}

export function createDefaultLayout(projectId: string): ProjectLayout {
  return {
    projectId,
    rows: 1,
    cols: 1,
    panes: [createPane(0, 0)],
    rowFractions: [1],
    colFractions: [1],
  };
}

export function normalizeFractions(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
}

export function cloneLayout(layout: ProjectLayout): ProjectLayout {
  return {
    ...layout,
    panes: layout.panes.map((pane) => ({ ...pane })),
    rowFractions: [...(layout.rowFractions ?? Array(layout.rows).fill(1 / layout.rows))],
    colFractions: [...(layout.colFractions ?? Array(layout.cols).fill(1 / layout.cols))],
  };
}
