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
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw Object.assign(new Error('No organization is available for this workspace account.'), { statusCode: 403 });
  }
  return row;
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

export async function requireOrganizationModule(userId, moduleKey) {
  await ensureSchema();
  if (!MODULE_KEYS.includes(moduleKey)) {
    throw Object.assign(new Error('Unknown workspace module.'), { statusCode: 500 });
  }
  const membership = await getMembership(userId);
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
