export const AUDIT_SCENARIOS = Object.freeze({
  clinic: {
    label: 'Sample clinic',
    opportunities: [
      {
        area: 'Website',
        title: 'Make the next step easy to spot',
        detail: 'Keep services, opening hours and the appointment action easy to find on desktop and mobile.',
      },
      {
        area: 'Enquiries',
        title: 'Give appointment requests a clear home',
        detail: 'Route new requests to a shared inbox and agree who reviews them next.',
      },
      {
        area: 'Repetitive work',
        title: 'Make common answers easier to reuse',
        detail: 'Prepare human-reviewed replies for recurring admin questions; keep care advice with the clinic team.',
      },
    ],
    firstStep: 'Sketch the path from a visitor’s first question to a confirmed appointment.',
  },
  restaurant: {
    label: 'Sample restaurant',
    opportunities: [
      {
        area: 'Website',
        title: 'Bring the essentials into one clear view',
        detail: 'Make the menu, location, hours and reservation or ordering options straightforward to find.',
      },
      {
        area: 'Enquiries',
        title: 'Capture the details staff need',
        detail: 'Use one enquiry path for table or event requests so key details are not scattered across messages.',
      },
      {
        area: 'Repetitive work',
        title: 'Reduce repeat typing without losing the human touch',
        detail: 'Keep a staff-reviewed set of answers for recurring questions about menus, hours and bookings.',
      },
    ],
    firstStep: 'List the three questions your team answers most often and where they arrive today.',
  },
  localService: {
    label: 'Sample local service',
    opportunities: [
      {
        area: 'Website',
        title: 'Explain what happens before a customer enquires',
        detail: 'Clarify services, service area and what to expect from a quote or first visit.',
      },
      {
        area: 'Enquiries',
        title: 'Keep new requests easy to review',
        detail: 'Collect the job type and preferred contact method, then give each request a clear owner.',
      },
      {
        area: 'Repetitive work',
        title: 'Connect the hand-offs already in your process',
        detail: 'Look for repeated copying between enquiries, estimates and scheduling before adding new tools.',
      },
    ],
    firstStep: 'Trace one recent enquiry from first contact through to the next agreed action.',
  },
  startup: {
    label: 'Sample startup or service team',
    opportunities: [
      {
        area: 'Website',
        title: 'Make the offer understandable at a glance',
        detail: 'Use a clear value proposition, plain-language service details and one obvious next step.',
      },
      {
        area: 'Enquiries',
        title: 'Route conversations with useful context',
        detail: 'Capture what a prospect needs and make the next owner or action visible to the team.',
      },
      {
        area: 'Repetitive work',
        title: 'Standardize the repeatable parts',
        detail: 'Use templates or small automations for recurring admin, with a person reviewing important decisions.',
      },
    ],
    firstStep: 'Choose one repeated hand-off and document its inputs, owner and desired outcome.',
  },
});

export const PIPELINE_STAGES = Object.freeze([
  { id: 'new', label: 'New Lead', marker: '01' },
  { id: 'contacted', label: 'Contacted', marker: '02' },
  { id: 'followUp', label: 'Follow-up', marker: '03' },
  { id: 'converted', label: 'Converted', marker: '04' },
]);

export const SAMPLE_PIPELINE_LEADS = Object.freeze([
  {
    id: 'sample-clinic',
    name: 'Sample clinic',
    type: 'CLINIC',
    request: 'Appointment enquiry',
    stage: 'new',
  },
  {
    id: 'sample-restaurant',
    name: 'Sample restaurant',
    type: 'RESTAURANT',
    request: 'Menu and booking question',
    stage: 'contacted',
  },
  {
    id: 'sample-service',
    name: 'Sample service team',
    type: 'LOCAL SERVICE',
    request: 'Quote request',
    stage: 'followUp',
  },
  {
    id: 'sample-startup',
    name: 'Sample startup',
    type: 'STARTUP',
    request: 'Website project enquiry',
    stage: 'converted',
  },
]);

/** Build a predictable, local-only example report. This is not a live AI call. */
export function buildSampleAuditReport(businessType) {
  if (!Object.hasOwn(AUDIT_SCENARIOS, businessType)) return null;
  const scenario = AUDIT_SCENARIOS[businessType];

  return {
    businessType,
    businessLabel: scenario.label,
    opportunities: scenario.opportunities.map((opportunity) => ({ ...opportunity })),
    firstStep: scenario.firstStep,
  };
}

/** Move one fictional lead between sample stages without mutating input data. */
export function moveSampleLead(leads, leadId, nextStage) {
  const validStage = PIPELINE_STAGES.some((stage) => stage.id === nextStage);
  if (!validStage || !leads.some((lead) => lead.id === leadId)) return leads;

  return leads.map((lead) => (lead.id === leadId ? { ...lead, stage: nextStage } : lead));
}
