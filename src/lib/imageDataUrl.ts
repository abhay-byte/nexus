import { readFile } from "@tauri-apps/plugin-fs";

const cache = new Map<string, string>();

export async function getImageDataUrl(path: string): Promise<string | null> {
  if (cache.has(path)) {
    return cache.get(path)!;
  }

  try {
    const bytes = await readFile(path);
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    cache.set(path, url);
    return url;
  } catch {
    return null;
  }
}
