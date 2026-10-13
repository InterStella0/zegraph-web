import { fetchApiUrl } from 'utils/generalUtils';

export function sendJson<T = any>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown,
  init: RequestInit = {},
): Promise<T> {
  return fetchApiUrl(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...init,
    body: JSON.stringify(body),
  });
}
