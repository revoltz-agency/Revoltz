/** Shared API-route helpers: consistent envelopes, no key leakage. */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PlacesApiError } from './google/places';
import { UnsafeUrlError } from './analysis/ssrf';

export interface ApiError {
  code: string;
  message: string;
  hint?: string;
  details?: unknown;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init);
}

export function fail(error: ApiError, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function badRequest(message: string, hint?: string) {
  return fail({ code: 'BAD_REQUEST', message, hint }, 400);
}

export function notFound(what = 'Resource') {
  return fail({ code: 'NOT_FOUND', message: `${what} not found.` }, 404);
}

export function serverError(err: unknown) {
  if (err instanceof ZodError) {
    return fail(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400,
    );
  }
  if (err instanceof PlacesApiError) {
    return fail({ code: err.code, message: err.message, hint: err.hint }, err.status >= 500 ? 502 : err.status);
  }
  if (err instanceof UnsafeUrlError) {
    return fail({ code: 'UNSAFE_URL', message: err.message }, 400);
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  return fail({ code: 'INTERNAL_ERROR', message }, 500);
}

export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

/** Strip anything that looks like a credential before echoing config to the UI. */
export function publicConfigStatus(input: {
  googlePlaces: { configured: boolean; regionCode: string; languageCode: string; missingVars: string[] };
  ai: { enabled: boolean; provider: string | null; model: string; customBaseUrl: boolean };
  websiteAnalysis: { enabled: boolean; timeoutMs: number; maxBytes: number };
  storage: { driver: string; path: string; persistent: boolean };
  counts: { leads: number; campaigns: number; suppression: number };
  demoMode: boolean;
  version: string;
}) {
  return {
    googlePlaces: {
      configured: input.googlePlaces.configured,
      regionCode: input.googlePlaces.regionCode,
      languageCode: input.googlePlaces.languageCode,
      missingVars: input.googlePlaces.missingVars,
    },
    ai: {
      configured: input.ai.enabled,
      provider: input.ai.provider,
      model: input.ai.enabled ? input.ai.model : null,
      baseUrlCustom: input.ai.customBaseUrl,
    },
    websiteAnalysis: input.websiteAnalysis,
    storage: { driver: input.storage.driver, persistent: input.storage.persistent },
    counts: input.counts,
    demoMode: input.demoMode,
    version: input.version,
  };
}
