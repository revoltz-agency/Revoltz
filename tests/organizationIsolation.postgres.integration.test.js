import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDatabase, __setPoolForTests, queryDatabase } from '../server/db.js';
import { readOrganizationModuleData, writeOrganizationModuleData } from '../server/organizationWorkspace.js';

const TEST_DATABASE_URL = String(process.env.AGENCYOS_TEST_DATABASE_URL || '').trim();
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_BILLING_ENFORCED = process.env.AGENCYOS_BILLING_ENFORCED;

test('PostgreSQL module data remains isolated between two organizations', { skip: !TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  delete process.env.AGENCYOS_BILLING_ENFORCED;
  __setPoolForTests(null);
  const suffix = randomUUID();
  const emailA = `isolation-a-${suffix}@example.test`;
  const emailB = `isolation-b-${suffix}@example.test`;
  const createdOrganizationIds = [];
  const createdUserIds = [];

  try {
    // Initialize schema through the same path used by the application.
    await readOrganizationModuleData('00000000-0000-4000-8000-000000000001', 'growth_sales')
      .catch((error) => {
        // The sentinel account should not exist; schema setup must still complete.
        assert.match(String(error?.message), /No organization is available/);
      });

    const userA = await queryDatabase(
      'INSERT INTO workspace_users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Isolation Test A', emailA, 'test-only-not-a-real-password-hash'],
    );
    const userB = await queryDatabase(
      'INSERT INTO workspace_users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Isolation Test B', emailB, 'test-only-not-a-real-password-hash'],
    );
    const userIdA = userA.rows[0].id;
    const userIdB = userB.rows[0].id;
    createdUserIds.push(userIdA, userIdB);

    const orgA = await queryDatabase(
      "INSERT INTO organizations (name, owner_user_id) VALUES ('Isolation A', $1) RETURNING id",
      [userIdA],
    );
    const orgB = await queryDatabase(
      "INSERT INTO organizations (name, owner_user_id) VALUES ('Isolation B', $1) RETURNING id",
      [userIdB],
    );
    const organizationIdA = orgA.rows[0].id;
    const organizationIdB = orgB.rows[0].id;
    createdOrganizationIds.push(organizationIdA, organizationIdB);

    for (const [organizationId, userId] of [[organizationIdA, userIdA], [organizationIdB, userIdB]]) {
      await queryDatabase(
        "INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
        [organizationId, userId],
      );
      await queryDatabase(
        "INSERT INTO organization_modules (organization_id, module_key, enabled) VALUES ($1, 'growth_sales', true)",
        [organizationId],
      );
    }

    await writeOrganizationModuleData(userIdA, 'growth_sales', {
      leads: [{ id: 'private-a', business: 'A-only lead' }],
    }, null);
    await writeOrganizationModuleData(userIdB, 'growth_sales', {
      leads: [{ id: 'private-b', business: 'B-only lead' }],
    }, null);

    const stateA = await readOrganizationModuleData(userIdA, 'growth_sales');
    const stateB = await readOrganizationModuleData(userIdB, 'growth_sales');
    assert.deepEqual(stateA.state, { leads: [{ id: 'private-a', business: 'A-only lead' }] });
    assert.deepEqual(stateB.state, { leads: [{ id: 'private-b', business: 'B-only lead' }] });
    assert.ok(!JSON.stringify(stateA.state).includes('private-b'));
    assert.ok(!JSON.stringify(stateB.state).includes('private-a'));

    // Saving a complete snapshot must also persist deletions, not merge stale cloud keys back in.
    await writeOrganizationModuleData(userIdA, 'growth_sales', {
      leads: [{ id: 'kept-a', business: 'Remaining lead' }],
      workflow: { stage: 'updated' },
    }, stateA.updatedAt.toISOString());
    const replacedStateA = await readOrganizationModuleData(userIdA, 'growth_sales');
    assert.deepEqual(replacedStateA.state, {
      leads: [{ id: 'kept-a', business: 'Remaining lead' }],
      workflow: { stage: 'updated' },
    });
    assert.ok(!JSON.stringify(replacedStateA.state).includes('private-a'));
  } finally {
    if (createdOrganizationIds.length) {
      await queryDatabase('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrganizationIds]).catch(() => {});
    }
    if (createdUserIds.length) {
      await queryDatabase('DELETE FROM workspace_users WHERE id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
    }
    await closeDatabase();
    __setPoolForTests(null);
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    if (ORIGINAL_BILLING_ENFORCED === undefined) delete process.env.AGENCYOS_BILLING_ENFORCED;
    else process.env.AGENCYOS_BILLING_ENFORCED = ORIGINAL_BILLING_ENFORCED;
  }
});
