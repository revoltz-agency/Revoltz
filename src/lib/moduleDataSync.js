const MODULE_KEYS = new Set(['growth_sales', 'clients_delivery', 'finance_reports', 'tools']);

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readCsrfToken() {
  try {
    const entry = globalThis.document?.cookie?.split('; ').find((part) => part.startsWith('agencyos_workspace_csrf='));
    return entry ? decodeURIComponent(entry.slice('agencyos_workspace_csrf='.length)) : '';
  } catch {
    return '';
  }
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Safely update selected keys inside an organization module's JSON document.
 * The server replaces the whole document, so every write must read the latest
 * revision, preserve sibling keys, and use optimistic concurrency. A retry is
 * allowed only when the keys being edited did not change in the meantime.
 */
export async function saveOrganizationModulePatch(moduleKey, patch, {
  fetchImpl = globalThis.fetch,
  csrfToken = readCsrfToken(),
} = {}) {
  if (!MODULE_KEYS.has(moduleKey)) throw new Error('Unknown AgencyOS module.');
  const patchObject = objectOrEmpty(patch);
  const endpoint = `/api/workspace/modules/${moduleKey}/data`;
  let baseline = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const readResponse = await fetchImpl(endpoint, {
      credentials: 'include',
      cache: 'no-store',
    });
    const readPayload = await readResponse.json().catch(() => ({}));
    if (!readResponse.ok) {
      throw Object.assign(new Error(readPayload.error || 'Could not load the latest cloud data.'), {
        status: readResponse.status,
        code: readPayload.code,
      });
    }

    const latestState = objectOrEmpty(readPayload.state);
    if (baseline && Object.keys(patchObject).some((key) => !sameValue(baseline[key], latestState[key]))) {
      throw Object.assign(new Error('This data changed on another device. Reload the module before saving again.'), {
        status: 409,
        code: 'WORKSPACE_REVISION_CONFLICT',
      });
    }
    if (!baseline) baseline = latestState;

    const state = { ...latestState, ...patchObject };
    const writeResponse = await fetchImpl(endpoint, {
      method: 'PUT',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-Workspace-CSRF': csrfToken } : {}),
      },
      body: JSON.stringify({ state, expectedUpdatedAt: readPayload.updatedAt ?? null }),
    });
    const writePayload = await writeResponse.json().catch(() => ({}));
    if (writeResponse.ok) return writePayload;

    if (writeResponse.status === 409 && attempt === 0) continue;
    throw Object.assign(new Error(writePayload.error || 'Cloud save failed.'), {
      status: writeResponse.status,
      code: writePayload.code,
    });
  }

  throw Object.assign(new Error('Cloud data changed on another device. Reload before saving again.'), {
    status: 409,
    code: 'WORKSPACE_REVISION_CONFLICT',
  });
}
