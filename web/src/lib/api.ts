export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function gifs(query: string): Promise<{ url: string; preview: string }[]> {
  const { gifs } = await api<{ gifs: { url: string; preview: string }[] }>(
    `/gifs?q=${encodeURIComponent(query)}`,
  );
  return gifs;
}

export async function upload(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "upload failed");
  }
  return res.json();
}
