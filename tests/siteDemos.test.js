import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_SCENARIOS,
  PIPELINE_STAGES,
  SAMPLE_PIPELINE_LEADS,
  buildSampleAuditReport,
  moveSampleLead,
} from '../src/site/demoData.js';

test('sample business auditor returns three illustrative areas for every fictional business type', () => {
  for (const [businessType, scenario] of Object.entries(AUDIT_SCENARIOS)) {
    const report = buildSampleAuditReport(businessType);

    assert.equal(report.businessLabel, scenario.label);
    assert.deepEqual(report.opportunities.map(({ area }) => area), ['Website', 'Enquiries', 'Repetitive work']);
    assert.ok(report.firstStep.length > 0);
    assert.notEqual(report.opportunities, scenario.opportunities, 'reports should not share the fixture array');
  }
});

test('sample business auditor safely rejects unknown types', () => {
  assert.equal(buildSampleAuditReport('real-customer'), null);
  assert.equal(buildSampleAuditReport(''), null);
  assert.equal(buildSampleAuditReport('constructor'), null);
  assert.equal(buildSampleAuditReport('__proto__'), null);
});

test('sample pipeline can move a lead to any valid stage without mutating its input', () => {
  const leads = SAMPLE_PIPELINE_LEADS.map((lead) => ({ ...lead }));
  const updated = moveSampleLead(leads, 'sample-clinic', 'followUp');

  assert.notEqual(updated, leads);
  assert.equal(leads[0].stage, 'new');
  assert.equal(updated.find((lead) => lead.id === 'sample-clinic').stage, 'followUp');
  assert.equal(updated.filter((lead) => lead.stage === 'followUp').length, 2);
  assert.deepEqual(PIPELINE_STAGES.map(({ label }) => label), ['New Lead', 'Contacted', 'Follow-up', 'Converted']);
});

test('sample pipeline ignores an unknown stage or lead', () => {
  const leads = SAMPLE_PIPELINE_LEADS.map((lead) => ({ ...lead }));
  assert.equal(moveSampleLead(leads, 'sample-clinic', 'won'), leads);
  assert.equal(moveSampleLead(leads, 'not-a-sample-lead', 'contacted'), leads);
});
