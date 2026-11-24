import { useEffect, useState } from 'react';
import type { Plan, Role } from '../shared/catalog.js';

export type Subscription = { plan: Plan; interval: 'MONTHLY' | 'ANNUAL'; status: string; endsAt: string; onboardingFeeMinor: number; currency: string };
export type Institution = { id: string; slug: string; name: string; type: string; timeZone: string; currency: string; brand: string; whiteLabel: boolean };
type User = { id: string; name: string; email: string };
export type Tenant = { user: User; platform: false; institution: Institution; memberId: string; role: Role; subscription: Subscription; operational: boolean };
export type Profile = Tenant | { user: User; platform: true };
export type Item = { id: string; title: string; kind: string; status: string; updatedAt: string };
export type Entry = Item & { version: number; data: Record<string, string | number>; memberId: string | null; memberName: string | null;
  links: Record<string, { id: string; title: string }>; statuses: string[] };
export type Paginated = { items: Entry[]; total: number; page: number; pageSize: number; statuses: string[] };

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function api<T>(path: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.method && options.method !== 'GET') headers.set('X-ELI-Request', '1');
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch('/api/v1' + path, {
    method: options.method, headers, signal: options.signal,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(result?.error?.message ?? 'The server is temporarily unavailable. Try again.', response.status, result?.error?.code);
  return result as T;
}
export const scope = (tenant: Tenant) => '/institutions/' + tenant.institution.id;

export function useLoad<T>(path: string | null, revision = 0) {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: Error }>({ key: null });
  const key = path === null ? null : path + ' ' + revision;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void api<T>(path, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ key, data }); },
      (error: Error) => { if (!controller.signal.aborted) setState({ key, error }); },
    );
    return () => controller.abort();
  }, [path, key]);
  return state.key === key ? state : { key };
}

export const dateLabel = (value: string, zone?: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: value.length === 10 ? 'UTC' : zone,
}).format(new Date(value));
