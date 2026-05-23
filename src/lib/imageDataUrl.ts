import { isTauri, httpApi } from "./api";

const cache = new Map<string, string>();

export async function getImageDataUrl(path: string): Promise<string | null> {
  // Already a data URL — return as-is
  if (path.startsWith("data:")) return path;

  if (cache.has(path)) {
    return cache.get(path)!;
  }

  if (isTauri()) {
    try {
      const fs = await import("@tauri-apps/plugin-fs");
      const bytes = await fs.readFile(path);
      const ext = path.split('.').pop()?.toLowerCase() || '';
      const type = ext === 'svg' ? 'image/svg+xml' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'ico' ? 'image/x-icon' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      const blob = new Blob([bytes], { type });
      const url = URL.createObjectURL(blob);
      cache.set(path, url);
      return url;
    } catch {
      return null;
    }
  } else {
    try {
      const res = await httpApi.post<{ data_url: string }>("/api/fs/read-file-base64", { path });
      if (res && res.data_url) {
        cache.set(path, res.data_url);
        return res.data_url;
      }
      return null;
    } catch {
      return null;
    }
  }
}