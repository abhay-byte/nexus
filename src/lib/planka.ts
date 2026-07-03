import type { PlankaBoard, PlankaCard, PlankaConfig, PlankaList, PlankaProject } from "../types";
import { API_BASE } from "./api";

let cachedConfig: PlankaConfig | null = null;
let cachedToken: string | null = null;

async function plankaProxy(path: string, options?: { method?: string; body?: string }): Promise<Response> {
  if (!cachedConfig) throw new Error("Not connected to Planka");
  const url = `${cachedConfig.baseUrl}${path}`;
  const method = options?.method || "GET";
  const body = options?.body || "";

  return fetch(`${API_BASE}/api/planka-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method, body, token: cachedToken || "" }),
  });
}

export function setPlankaConfig(config: PlankaConfig) {
  cachedConfig = config;
  cachedToken = config.token || null;
}

export function getPlankaConfig(): PlankaConfig | null {
  return cachedConfig;
}

export async function plankaLogin(baseUrl: string, email: string, password: string): Promise<string> {
  const body = JSON.stringify({ emailOrUsername: email, password });
  const resp = await fetch(`${API_BASE}/api/planka-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${baseUrl}/api/access-tokens`, method: "POST", body, token: "" }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ message: "Login failed" }));
    throw new Error(err.message || `Login failed (${resp.status})`);
  }
  const data = await resp.json() as { item: string };
  const token = data.item;
  cachedToken = token;
  return token;
}

export async function plankaFetchProjects(): Promise<PlankaProject[]> {
  const resp = await plankaProxy("/api/projects");
  if (!resp.ok) throw new Error(`Failed to fetch projects (${resp.status})`);
  const data = await resp.json() as { items: PlankaProject[] };
  return data.items;
}

export async function plankaFetchBoards(projectId: string): Promise<PlankaBoard[]> {
  const resp = await plankaProxy(`/api/projects/${projectId}`);
  if (!resp.ok) throw new Error(`Failed to fetch boards (${resp.status})`);
  const data = await resp.json() as { included: { boards: PlankaBoard[] } };
  return data.included?.boards ?? [];
}

export async function plankaFetchBoard(boardId: string): Promise<{ lists: PlankaList[] }> {
  const resp = await plankaProxy(`/api/boards/${boardId}`);
  if (!resp.ok) throw new Error(`Failed to fetch board (${resp.status})`);
  const data = await resp.json() as { included: { lists: PlankaList[] } };
  return { lists: data.included?.lists ?? [] };
}

export async function plankaFetchCards(listId: string): Promise<PlankaCard[]> {
  const resp = await plankaProxy(`/api/lists/${listId}/cards`);
  if (!resp.ok) throw new Error(`Failed to fetch cards (${resp.status})`);
  const data = await resp.json() as { items: PlankaCard[] };
  return data.items;
}

export async function plankaFetchAllBoardData(boardId: string): Promise<{ lists: PlankaList[]; cardsByList: Record<string, PlankaCard[]> }> {
  const { lists } = await plankaFetchBoard(boardId);

  const sortedLists = [...lists]
    .filter(l => l.type === "active" && l.name !== "None")
    .sort((a, b) => {
      if (a.position == null) return 1;
      if (b.position == null) return -1;
      return a.position - b.position;
    });

  const cardsByList: Record<string, PlankaCard[]> = {};
  await Promise.all(
    sortedLists.map(async (list) => {
      const cards = await plankaFetchCards(list.id);
      cardsByList[list.id] = cards.sort((a, b) => a.position - b.position);
    })
  );

  return { lists: sortedLists, cardsByList };
}

export async function plankaCreateCard(listId: string, boardId: string, name: string, description?: string): Promise<PlankaCard> {
  const body: Record<string, unknown> = { name, boardId, type: "project", position: 1 };
  if (description) body.description = description;
  const resp = await plankaProxy(`/api/lists/${listId}/cards`, { method: "POST", body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`Failed to create card (${resp.status})`);
  const data = await resp.json() as { item: PlankaCard };
  return data.item;
}

export async function plankaUpdateCard(cardId: string, patch: Record<string, unknown>): Promise<PlankaCard> {
  const resp = await plankaProxy(`/api/cards/${cardId}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!resp.ok) throw new Error(`Failed to update card (${resp.status})`);
  const data = await resp.json() as { item: PlankaCard };
  return data.item;
}

export async function plankaMoveCard(cardId: string, toListId: string, toBoardId: string): Promise<PlankaCard> {
  return plankaUpdateCard(cardId, { listId: toListId, boardId: toBoardId, position: 1 });
}

export async function plankaDeleteCard(cardId: string): Promise<void> {
  const resp = await plankaProxy(`/api/cards/${cardId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Failed to delete card (${resp.status})`);
}

export async function plankaCreateList(boardId: string, name: string): Promise<PlankaList> {
  const body = JSON.stringify({ name, position: 1, type: "active" });
  const resp = await plankaProxy(`/api/boards/${boardId}/lists`, { method: "POST", body });
  if (!resp.ok) throw new Error(`Failed to create list (${resp.status})`);
  const data = await resp.json() as { item: PlankaList };
  return data.item;
}

export async function plankaDeleteList(listId: string): Promise<void> {
  const resp = await plankaProxy(`/api/lists/${listId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Failed to delete list (${resp.status})`);
}

export async function plankaCreateProject(name: string, description?: string): Promise<PlankaProject> {
  const body: Record<string, unknown> = { name, type: "private" };
  if (description) body.description = description;
  const resp = await plankaProxy("/api/projects", { method: "POST", body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`Failed to create project (${resp.status})`);
  const data = await resp.json() as { item: PlankaProject };
  return data.item;
}

export async function plankaCreateBoard(projectId: string, name: string): Promise<PlankaBoard> {
  const body = JSON.stringify({ name, position: 1 });
  const resp = await plankaProxy(`/api/projects/${projectId}/boards`, { method: "POST", body });
  if (!resp.ok) throw new Error(`Failed to create board (${resp.status})`);
  const data = await resp.json() as { item: PlankaBoard };
  return data.item;
}

export async function plankaDeleteProject(projectId: string): Promise<void> {
  // Must delete all boards first — Planka rejects project deletion if boards exist
  const boards = await plankaFetchBoards(projectId);
  await Promise.all(boards.map(b => plankaDeleteBoard(b.id)));
  const resp = await plankaProxy(`/api/projects/${projectId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Failed to delete project (${resp.status})`);
}

export async function plankaDeleteBoard(boardId: string): Promise<void> {
  const resp = await plankaProxy(`/api/boards/${boardId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Failed to delete board (${resp.status})`);
}
