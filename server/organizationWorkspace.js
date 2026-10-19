// Organization profile and module selection API for the multi-tenant workspace.
// Selection is configuration only; subscription enforcement is added separately.
import { ensureSchema, queryDatabase } from './db.js';

export const WORKSPACE_MODULES = Object.freeze([
  { key: 'growth_sales', label: 'Growth & sales' },
  { key: 'clients_delivery', label: 'Clients & delivery' },
  { key: 'finance_reports', label: 'Finance & reports' },
  { key: 'tools', label: 'Tools' },
]);

const MODULE_KEYS = WORKSPACE_MODULES.map((module) => module.key);

async function getMembership(userId) {
  const result = await queryDatabase(
    `SELECT o.id AS organization_id, o.name AS organization_name,
            m.role, s.plan_key, s.status AS subscription_status,
            s.current_period_start, s.current_period_end, s.cancel_at_period_end
     FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     LEFT JOIN organization_subscriptions s ON s.organization_id = o.id
     WHERE m.user_id = $1
     ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.created_at ASC
     LIMIT 2`,
    [userId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error('No organization is available for this workspace account.'), { statusCode: 403 });
  }
  // Never silently choose an organization when one account belongs to more than
  // one. Billing already rejects this ambiguous state; workspace reads/writes
  // must fail closed too until an explicit organization selector is implemented.
  if (result.rows.length > 1) {
    throw Object.assign(new Error('This account belongs to multiple organizations. Select a workspace explicitly before continuing.'), {
      statusCode: 409,
      code: 'AMBIGUOUS_ORGANIZATION_MEMBERSHIP',
    });
  }
  return result.rows[0];
}

export async function readOrganizationWorkspace(userId) {
  await ensureSchema();
  const membership = await getMembership(userId);
  const moduleResult = await queryDatabase(
    'SELECT module_key, enabled, settings FROM organization_modules WHERE organization_id = $1',
    [membership.organization_id],
  );
  const configured = new Map(moduleResult.rows.map((row) => [row.module_key, row]));
  return {
    organization: {
      id: membership.organization_id,
      name: membership.organization_name,
      role: membership.role,
    },
    subscription: {
      planKey: membership.plan_key || 'starter',
      status: membership.subscription_status || 'inactive',
      currentPeriodStart: membership.current_period_start || null,
      currentPeriodEnd: membership.current_period_end || null,
      cancelAtPeriodEnd: Boolean(membership.cancel_at_period_end),
    },
    modules: WORKSPACE_MODULES.map((module) => ({
      ...module,
      enabled: Boolean(configured.get(module.key)?.enabled),
      settings: configured.get(module.key)?.settings && typeof configured.get(module.key).settings === 'object'
        ? configured.get(module.key).settings
        : {},
    })),
  };
}

export async function requireOrganizationRole(userId, allowedRoles) {
  await ensureSchema();
  const membership = await getMembership(userId);
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [];
  if (!roles.includes(membership.role)) {
    throw Object.assign(new Error('Your organization role does not allow this action.'), {
      statusCode: 403,
      code: 'ORGANIZATION_ROLE_REQUIRED',
    });
  }
  return true;
}

function enforceActiveSubscription(membership) {
  const billingEnforced = String(process.env.AGENCYOS_BILLING_ENFORCED || '').trim().toLowerCase() === 'true';
  const periodEnd = membership.current_period_end == null ? null : new Date(membership.current_period_end).getTime();
  // Webhooks are the primary source of lifecycle updates, but a missed expiry
  // event must not leave a known-expired subscription entitled indefinitely.
  const periodExpired = periodEnd !== null && Number.isFinite(periodEnd) && periodEnd <= Date.now();
  if (billingEnforced && (membership.subscription_status !== 'active' || periodExpired)) {
    throw Object.assign(new Error('An active subscription is required to use this workspace feature.'), {
      statusCode: 402,
      code: 'SUBSCRIPTION_REQUIRED',
      subscriptionStatus: membership.subscription_status || 'inactive',
    });
  }
  return true;
}

export async function requireActiveOrganizationSubscription(userId) {
  await ensureSchema();
  if (String(process.env.AGENCYOS_BILLING_ENFORCED || '').trim().toLowerCase() !== 'true') return true;
  return enforceActiveSubscription(await getMembership(userId));
}

export async function requireOrganizationModule(userId, moduleKey) {
  await ensureSchema();
  if (!MODULE_KEYS.includes(moduleKey)) {
    throw Object.assign(new Error('Unknown workspace module.'), { statusCode: 400, code: 'INVALID_WORKSPACE_MODULE' });
  }
  const membership = await getMembership(userId);
  enforceActiveSubscription(membership);
  const result = await queryDatabase(
    `SELECT enabled FROM organization_modules
     WHERE organization_id = $1 AND module_key = $2
     LIMIT 1`,
    [membership.organization_id, moduleKey],
  );
  if (!result.rows[0]?.enabled) {
    throw Object.assign(new Error('This feature is disabled in your workspace settings.'), {
      statusCode: 403,
      code: 'WORKSPACE_MODULE_DISABLED',
      moduleKey,
    });
  }
  return true;
}

export async function readOrganizationModuleData(userId, moduleKey) {
  await requireOrganizationModule(userId, moduleKey);
  const membership = await getMembership(userId);
  const result = await queryDatabase(
    `SELECT state, updated_at FROM organization_module_data
     WHERE organization_id = $1 AND module_key = $2 LIMIT 1`,
    [membership.organization_id, moduleKey],
  );
  const row = result.rows[0];
  return {
    state: row?.state && typeof row.state === 'object' && !Array.isArray(row.state) ? row.state : {},
    updatedAt: row?.updated_at || null,
  };
}

export async function writeOrganizationModuleData(userId, moduleKey, state, expectedUpdatedAt) {
  if (expectedUpdatedAt === undefined) {
    throw Object.assign(new Error('Refresh the latest cloud data before saving.'), {
      statusCode: 400,
      code: 'WORKSPACE_REVISION_REQUIRED',
    });
  }
  if (expectedUpdatedAt !== null &&
      (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt)))) {
    throw Object.assign(new Error('Workspace revision is invalid. Refresh before saving.'), { statusCode: 400, code: 'INVALID_WORKSPACE_REVISION' });
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw Object.assign(new Error('Module data must be an object.'), { statusCode: 400, code: 'INVALID_MODULE_DATA' });
  }
  let serialized;
  try { serialized = JSON.stringify(state); } catch {
    throw Object.assign(new Error('Module data is invalid.'), { statusCode: 400, code: 'INVALID_MODULE_DATA' });
  }
  if (serialized.length > 1_000_000 || Object.keys(state).length > 250) {
    throw Object.assign(new Error('Module data is too large.'), { statusCode: 413, code: 'MODULE_DATA_TOO_LARGE' });
  }
  await requireOrganizationModule(userId, moduleKey);
  const membership = await getMembership(userId);
  const result = await queryDatabase(
    `INSERT INTO organization_module_data (organization_id, module_key, state, updated_at)
     VALUES ($1, $2, $3::jsonb, date_trunc('milliseconds', now()))
     ON CONFLICT (organization_id, module_key)
     DO UPDATE SET state = EXCLUDED.state, updated_at = date_trunc('milliseconds', now())
     WHERE date_trunc('milliseconds', organization_module_data.updated_at) IS NOT DISTINCT FROM $4::timestamptz
     RETURNING updated_at`,
    [membership.organization_id, moduleKey, serialized, expectedUpdatedAt],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error('This workspace changed on another device. Refresh the latest data before saving again.'), {
      statusCode: 409,
      code: 'WORKSPACE_REVISION_CONFLICT',
    });
  }
  return { saved: true, updatedAt: result.rows[0].updated_at || null };
}

export async function updateOrganizationModules(userId, requestedKeys) {
  await ensureSchema();
  if (!Array.isArray(requestedKeys) || requestedKeys.length > MODULE_KEYS.length ||
      requestedKeys.some((key) => typeof key !== 'string' || !MODULE_KEYS.includes(key))) {
    throw Object.assign(new Error('Choose valid workspace modules.'), { statusCode: 400 });
  }
  const enabledKeys = [...new Set(requestedKeys)];
  const membership = await getMembership(userId);
  if (!['owner', 'admin'].includes(membership.role)) {
    throw Object.assign(new Error('Only organization owners and admins can change modules.'), { statusCode: 403 });
  }
  await queryDatabase(
    `INSERT INTO organization_modules (organization_id, module_key, enabled)
     SELECT $1, keys.module_key, keys.module_key = ANY($2::text[])
     FROM unnest($3::text[]) AS keys(module_key)
     ON CONFLICT (organization_id, module_key)
     DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
    [membership.organization_id, enabledKeys, MODULE_KEYS],
  );
  return readOrganizationWorkspace(userId);
}
