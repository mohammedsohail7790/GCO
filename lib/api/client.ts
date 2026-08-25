// Thin fetch wrapper for client components - always sends cookies, always
// hits the versioned API, and throws on non-2xx so callers can catch/display.
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? `Request failed: ${res.status}`)
  }
  return json.data as T
}
