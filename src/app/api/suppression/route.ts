import type { NextRequest } from 'next/server';
import { ok, readJson, serverError } from '@/lib/api';
import { suppressionSchema } from '@/lib/validation';
import { addSuppression, listSuppression } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/suppression — the do-not-contact list. */
export async function GET() {
  try {
    return ok({ entries: listSuppression() });
  } catch (err) {
    return serverError(err);
  }
}

/** POST /api/suppression — add a phone / email / domain / business to it. */
export async function POST(req: NextRequest) {
  try {
    const payload = suppressionSchema.parse(await readJson(req));
    const entry = addSuppression({ kind: payload.kind, value: payload.value, reason: payload.reason ?? '' });
    return ok({ entry, entries: listSuppression() });
  } catch (err) {
    return serverError(err);
  }
}
