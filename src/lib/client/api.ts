'use client';

/** Tiny fetch wrapper shared by all client components. */

export class ApiClientError extends Error {
  code: string;
  hint?: string;
  status: number;

  constructor(message: string, code: string, status: number, hint?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }

  get display(): string {
    return this.hint ? `${this.message} — ${this.hint}` : this.message;
  }
}

interface Envelope<T> {
  ok: boolean;
  error?: { code: string; message: string; hint?: string; details?: unknown };
  [key: string]: unknown;
}

export async function apiFetch<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T & Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiClientError('Network error — could not reach the AgencyOS server.', 'NETWORK', 0);
  }

  const text = await res.text();
  let payload: Envelope<T> | null = null;
  try {
    payload = text ? (JSON.parse(text) as Envelope<T>) : null;
  } catch {
    throw new ApiClientError(`Server returned an unparseable response (HTTP ${res.status}).`, 'BAD_RESPONSE', res.status);
  }

  if (!res.ok || !payload?.ok) {
    const err = payload?.error;
    throw new ApiClientError(
      err?.message ?? `Request failed (HTTP ${res.status})`,
      err?.code ?? 'UNKNOWN',
      res.status,
      err?.hint,
    );
  }

  return payload as T & Envelope<T>;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiClientError) return err.display;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
