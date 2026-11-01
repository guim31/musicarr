/** Appel d'API qui lève une erreur lisible, plutôt que de renvoyer un corps d'erreur à vérifier. */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Erreur ${response.status}`);
  }
  return body as T;
}

export function postJson<T = unknown>(url: string, payload?: unknown, method = 'POST'): Promise<T> {
  return api<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}
