import { isTauri } from "./api";

const cache = new Map<string, string>();

export async function getImageDataUrl(path: string): Promise<string | null> {
  // Already a data URL — return as-is
  if (path.startsWith("data:")) return path;

  if (!isTauri()) return null;
  if (cache.has(path)) {
    return cache.get(path)!;
  }

  try {
    const fs = await import("@tauri-apps/plugin-fs");
    const bytes = await fs.readFile(path);
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    cache.set(path, url);
    return url;
  } catch {
    return null;
  }
}