import type { NextRequest } from 'next/server';
import { notFound, ok, serverError } from '@/lib/api';
import { listSuppression, removeSuppression } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/suppression/:id — remove an entry from the do-not-contact list. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const removed = removeSuppression(id);
    if (!removed) return notFound('Suppression entry');
    return ok({ deleted: id, entries: listSuppression() });
  } catch (err) {
    return serverError(err);
  }
}
