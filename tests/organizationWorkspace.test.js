import test from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests } from '../server/db.js';
import { readOrganizationModuleData, readOrganizationWorkspace, requireActiveOrganizationSubscription, requireOrganizationModule, requireOrganizationRole, updateOrganizationModules, WORKSPACE_MODULES, writeOrganizationModuleData } from '../server/organizationWorkspace.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const USER_ID = '3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f';
const ORGANIZATION_ID = 'org-test-id';

function useOrganizationDatabase(role = 'owner', organizationId = ORGANIZATION_ID, sharedModuleData = new Map(), subscriptionStatus = 'inactive', currentPeriodEnd = null) {
  process.env.DATABASE_URL = 'postgres://example.invalid/agencyos-test';
  const calls = [];
  const modules = new Map();
  const moduleData = sharedModuleData;
  const pool = {
    calls,
    on() {},
    async end() {},
    async query(text, values = []) {
      calls.push({ text, values });
      if (/^\s*(CREATE (TABLE|INDEX) IF NOT EXISTS|ALTER TABLE organization_subscriptions)/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO (organizations|organization_memberships|organization_subscriptions|organization_workspace_data)\b/i.test(text) && /\bSELECT\b/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO organization_modules\s*\(organization_id, module_key, enabled\)\s*SELECT o\.id/i.test(text)) {
        for (const key of WORKSPACE_MODULES.map((module) => module.key)) {
          modules.set(key, { module_key: key, enabled: true, settings: {}, organization_id: organizationId });
        }
        return { rows: [], rowCount: WORKSPACE_MODULES.length };
      }
      if (text.includes('FROM organization_memberships m') && text.includes('JOIN organizations o')) {
        return { rows: [{
          organization_id: organizationId,
          organization_name: organizationId === ORGANIZATION_ID ? 'Priya workspace' : `Workspace ${organizationId}`,
          role,
          plan_key: 'starter',
          subscription_status: subscriptionStatus,
          current_period_start: null,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: false,
        }], rowCount: 1 };
      }
      if (text.includes('SELECT state, updated_at FROM organization_module_data')) {
        const row = moduleData.get(values[0] + ':' + values[1]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes('INSERT INTO organization_module_data')) {
        const [organizationId, moduleKey, serialized, expectedUpdatedAt] = values;
        const key = organizationId + ':' + moduleKey;
        const existing = moduleData.get(key);
        if (values.length === 4 && existing &&
            (expectedUpdatedAt == null || Date.parse(expectedUpdatedAt) !== Date.parse(existing.updated_at))) {
          return { rows: [], rowCount: 0 };
        }
        const row = { state: JSON.parse(serialized), updated_at: new Date('2026-01-03T00:00:00.000Z') };
        moduleData.set(key, row);
        return { rows: [{ updated_at: row.updated_at }], rowCount: 1 };
      }
      if (text.includes('SELECT enabled FROM organization_modules')) {
        const row = modules.get(values[1]);
        return { rows: row ? [{ enabled: row.enabled }] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes('SELECT module_key, enabled, settings FROM organization_modules')) {
        return { rows: [...modules.values()], rowCount: modules.size };
      }
      if (text.includes('INSERT INTO organization_modules')) {
        const [organizationId, enabledKeys, allKeys] = values;
        for (const key of allKeys) {
          modules.set(key, {
            module_key: key,
            enabled: enabledKeys.includes(key),
            settings: {},
            organization_id: organizationId,
          });
        }
        return { rows: [], rowCount: allKeys.length };
      }
      throw new Error(`Unexpected organization SQL: ${text}`);
    },
  };
  __setPoolForTests(pool);
  return { calls, modules, moduleData, pool };
}

test.after(() => {
  __setPoolForTests(null);
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

test('organization overview returns membership, subscription and explicit module choices', async () => {
  const db = useOrganizationDatabase();
  const result = await readOrganizationWorkspace(USER_ID);
  assert.deepEqual(result.organization, { id: ORGANIZATION_ID, name: 'Priya workspace', role: 'owner' });
  assert.deepEqual(result.subscription, {
    planKey: 'starter',
    status: 'inactive',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
  assert.deepEqual(result.modules.map(({ key, enabled }) => ({ key, enabled })), WORKSPACE_MODULES.map(({ key }) => ({ key, enabled: true })));
  assert.ok(db.calls.some((call) => call.text.includes('JOIN organization_subscriptions s')));
});

test('owners can save a bounded allowlisted module selection', async () => {
  const db = useOrganizationDatabase();
  const result = await updateOrganizationModules(USER_ID, ['growth_sales', 'tools', 'growth_sales']);
  assert.deepEqual(result.modules.filter((module) => module.enabled).map((module) => module.key), ['growth_sales', 'tools']);
  const upsert = db.calls.find((call) => call.text.includes('INSERT INTO organization_modules') && call.text.includes('FROM unnest($3::text[])'));
  assert.deepEqual(upsert.values, [ORGANIZATION_ID, ['growth_sales', 'tools'], WORKSPACE_MODULES.map((module) => module.key)]);
  assert.match(upsert.text, /ON CONFLICT \(organization_id, module_key\)/);
});

test('workspace state subscription guard stays compatible by default and blocks inactive billing when enforced', async () => {
  const db = useOrganizationDatabase();
  const original = process.env.AGENCYOS_BILLING_ENFORCED;
  try {
    delete process.env.AGENCYOS_BILLING_ENFORCED;
    assert.equal(await requireActiveOrganizationSubscription(USER_ID), true);
    assert.equal(db.calls.some((call) => call.text.includes('FROM organization_memberships m')), false);

    process.env.AGENCYOS_BILLING_ENFORCED = 'true';
    await assert.rejects(requireActiveOrganizationSubscription(USER_ID), {
      statusCode: 402,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  } finally {
    if (original === undefined) delete process.env.AGENCYOS_BILLING_ENFORCED;
    else process.env.AGENCYOS_BILLING_ENFORCED = original;
  }
});

test('billing enforcement denies a known-expired active subscription but allows an unexpired one', async () => {
  const original = process.env.AGENCYOS_BILLING_ENFORCED;
  process.env.AGENCYOS_BILLING_ENFORCED = 'true';
  try {
    const db = useOrganizationDatabase('owner', ORGANIZATION_ID, new Map(), 'active', '2026-01-01T00:00:00.000Z');
    await assert.rejects(requireActiveOrganizationSubscription(USER_ID), {
      statusCode: 402,
      code: 'SUBSCRIPTION_REQUIRED',
      subscriptionStatus: 'active',
    });
    await assert.rejects(requireOrganizationModule(USER_ID, 'growth_sales'), {
      statusCode: 402,
      code: 'SUBSCRIPTION_REQUIRED',
      subscriptionStatus: 'active',
    });
    assert.equal(db.calls.some((call) => call.text.includes('SELECT enabled FROM organization_modules')), false);

    useOrganizationDatabase('owner', ORGANIZATION_ID, new Map(), 'active', '2027-01-01T00:00:00.000Z');
    assert.equal(await requireActiveOrganizationSubscription(USER_ID), true);

    // Some provider events omit the period end. Keep status-based behavior for
    // those records rather than blocking a valid subscription due to missing data.
    useOrganizationDatabase('owner', ORGANIZATION_ID, new Map(), 'active', null);
    assert.equal(await requireActiveOrganizationSubscription(USER_ID), true);
  } finally {
    if (original === undefined) delete process.env.AGENCYOS_BILLING_ENFORCED;
    else process.env.AGENCYOS_BILLING_ENFORCED = original;
  }
});

test('server module entitlements permit enabled modules and deny disabled or missing modules', async () => {
  const db = useOrganizationDatabase();
  assert.equal(await requireOrganizationModule(USER_ID, 'growth_sales'), true);
  db.modules.set('growth_sales', { module_key: 'growth_sales', enabled: false, settings: {} });
  await assert.rejects(requireOrganizationModule(USER_ID, 'growth_sales'), { statusCode: 403, code: 'WORKSPACE_MODULE_DISABLED' });
  await assert.rejects(requireOrganizationModule(USER_ID, 'not_a_module'), { statusCode: 400, code: 'INVALID_WORKSPACE_MODULE' });
});

test('billing enforcement requires an active subscription when the rollout switch is enabled', async () => {
  const db = useOrganizationDatabase();
  const original = process.env.AGENCYOS_BILLING_ENFORCED;
  process.env.AGENCYOS_BILLING_ENFORCED = 'true';
  try {
    await assert.rejects(requireOrganizationModule(USER_ID, 'growth_sales'), {
      statusCode: 402,
      code: 'SUBSCRIPTION_REQUIRED',
    });
    assert.equal(db.calls.some((call) => call.text.includes('SELECT enabled FROM organization_modules')), false);
  } finally {
    if (original === undefined) delete process.env.AGENCYOS_BILLING_ENFORCED;
    else process.env.AGENCYOS_BILLING_ENFORCED = original;
  }
});

test('module data is stored separately and only accessible when that module is enabled', async () => {
  const db = useOrganizationDatabase('member');
  const originalBilling = process.env.AGENCYOS_BILLING_ENFORCED;
  delete process.env.AGENCYOS_BILLING_ENFORCED;
  try {
    const saved = await writeOrganizationModuleData(USER_ID, 'growth_sales', { leads: [{ id: 'lead-1' }] });
    assert.equal(saved.saved, true);
    const read = await readOrganizationModuleData(USER_ID, 'growth_sales');
    assert.deepEqual(read.state, { leads: [{ id: 'lead-1' }] });
    const moduleInsert = db.calls.find((call) => call.text.includes('INSERT INTO organization_module_data'));
    const moduleRead = db.calls.find((call) => call.text.includes('SELECT state, updated_at FROM organization_module_data'));
    assert.ok(moduleInsert, 'module state must be persisted through the organization-scoped table');
    assert.ok(moduleRead, 'module state must be read from the organization-scoped table');
    assert.match(moduleInsert.text, /ON CONFLICT \(organization_id, module_key\)/);
    assert.match(moduleInsert.text, /DO UPDATE SET state = EXCLUDED\.state/);
    assert.doesNotMatch(moduleInsert.text, /organization_module_data\.state \|\| EXCLUDED\.state/, 'full snapshots must remove stale keys');
    assert.match(moduleRead.text, /WHERE organization_id = \$1 AND module_key = \$2/);
    assert.deepEqual(moduleInsert.values.slice(0, 2), [ORGANIZATION_ID, 'growth_sales']);
    assert.deepEqual(moduleRead.values, [ORGANIZATION_ID, 'growth_sales']);

    db.modules.set('growth_sales', { module_key: 'growth_sales', enabled: false, settings: {} });
    await assert.rejects(readOrganizationModuleData(USER_ID, 'growth_sales'), { statusCode: 403, code: 'WORKSPACE_MODULE_DISABLED' });
    await assert.rejects(writeOrganizationModuleData(USER_ID, 'growth_sales', { leads: [] }), { statusCode: 403, code: 'WORKSPACE_MODULE_DISABLED' });
    const queriesBeforeInvalidModule = db.calls.length;
    await assert.rejects(writeOrganizationModuleData(USER_ID, 'not_a_module', {}), { statusCode: 400, code: 'INVALID_WORKSPACE_MODULE' });
    assert.equal(db.calls.length, queriesBeforeInvalidModule, 'unknown module keys are rejected before querying organization data');
    await assert.rejects(writeOrganizationModuleData(USER_ID, 'tools', []), { statusCode: 400, code: 'INVALID_MODULE_DATA' });
  } finally {
    if (originalBilling === undefined) delete process.env.AGENCYOS_BILLING_ENFORCED;
    else process.env.AGENCYOS_BILLING_ENFORCED = originalBilling;
  }
});

test('shared workspace writes are restricted to owners and admins until module data is isolated', async () => {
  useOrganizationDatabase('owner');
  assert.equal(await requireOrganizationRole(USER_ID, ['owner', 'admin']), true);

  useOrganizationDatabase('member');
  await assert.rejects(requireOrganizationRole(USER_ID, ['owner', 'admin']), {
    statusCode: 403,
    code: 'ORGANIZATION_ROLE_REQUIRED',
  });
});

test('module selection rejects unknown keys and non-owner members', async () => {
  useOrganizationDatabase();
  await assert.rejects(updateOrganizationModules(USER_ID, ['admin_override']), { statusCode: 400 });
  await assert.rejects(updateOrganizationModules(USER_ID, 'growth_sales'), { statusCode: 400 });

  useOrganizationDatabase('member');
  await assert.rejects(updateOrganizationModules(USER_ID, ['growth_sales']), { statusCode: 403 });
});


test('module data remains isolated between organizations in shared storage', async () => {
  // Both simulated organizations use the same backing store, as they would in PostgreSQL.
  const sharedModuleData = new Map();
  const first = useOrganizationDatabase('owner', 'org-first', sharedModuleData);
  await writeOrganizationModuleData(USER_ID, 'growth_sales', {
    leads: [{ id: 'first-org-lead', name: 'First organization lead' }],
  });

  const second = useOrganizationDatabase('owner', 'org-second', sharedModuleData);
  const emptySecondWorkspace = await readOrganizationModuleData(USER_ID, 'growth_sales');
  assert.deepEqual(emptySecondWorkspace.state, {});

  await writeOrganizationModuleData(USER_ID, 'growth_sales', {
    leads: [{ id: 'second-org-lead', name: 'Second organization lead' }],
  });

  const firstState = sharedModuleData.get('org-first:growth_sales');
  const secondState = sharedModuleData.get('org-second:growth_sales');
  assert.deepEqual(firstState.state.leads.map((lead) => lead.id), ['first-org-lead']);
  assert.deepEqual(secondState.state.leads.map((lead) => lead.id), ['second-org-lead']);
  assert.equal(sharedModuleData.size, 2, 'each organization must have a separate row for the same module');
  assert.notEqual(firstState, secondState);
});


test('module data rejects oversized payloads before touching organization storage', async () => {
  const db = useOrganizationDatabase();
  const tooManyKeys = Object.fromEntries(Array.from({ length: 251 }, (_, index) => [`key-${index}`, index]));
  await assert.rejects(writeOrganizationModuleData(USER_ID, 'growth_sales', tooManyKeys), {
    statusCode: 413,
    code: 'MODULE_DATA_TOO_LARGE',
  });

  await assert.rejects(writeOrganizationModuleData(USER_ID, 'growth_sales', {
    largeValue: 'x'.repeat(1_000_001),
  }), {
    statusCode: 413,
    code: 'MODULE_DATA_TOO_LARGE',
  });
  assert.equal(db.calls.some((call) => call.text.includes('INSERT INTO organization_module_data')), false);
});

test('module data rejects circular payloads with a validation error', async () => {
  const db = useOrganizationDatabase();
  const circular = {};
  circular.self = circular;
  await assert.rejects(writeOrganizationModuleData(USER_ID, 'growth_sales', circular), {
    statusCode: 400,
    code: 'INVALID_MODULE_DATA',
  });
  assert.equal(db.calls.some((call) => call.text.includes('INSERT INTO organization_module_data')), false);
});

test('module data snapshot writes reject stale revisions instead of overwriting newer cloud state', async () => {
  const db = useOrganizationDatabase('owner');
  const first = await writeOrganizationModuleData(USER_ID, 'growth_sales', { leads: [{ id: 'lead-new' }] }, null);
  assert.equal(first.saved, true);
  await assert.rejects(
    writeOrganizationModuleData(USER_ID, 'growth_sales', { leads: [] }, null),
    { statusCode: 409, code: 'WORKSPACE_REVISION_CONFLICT' },
  );
  const stored = await readOrganizationModuleData(USER_ID, 'growth_sales');
  assert.deepEqual(stored.state, { leads: [{ id: 'lead-new' }] });
  const guardedWrite = db.calls.find((call) => call.text.includes('INSERT INTO organization_module_data') && call.values.length === 4);
  assert.match(guardedWrite.text, /WHERE organization_module_data\.updated_at IS NOT DISTINCT FROM \$4::timestamptz/);
});
