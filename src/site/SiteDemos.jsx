import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  MoveRight,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  AUDIT_SCENARIOS,
  PIPELINE_STAGES,
  SAMPLE_PIPELINE_LEADS,
  buildSampleAuditReport,
  moveSampleLead,
} from './demoData.js';
import { Reveal } from './SitePrimitives.jsx';

function DemoLabel({ children = 'DEMONSTRATION' }) {
  return <span className="rv-demo-label"><span className="rv-demo-label-dot" />{children}</span>;
}

function WebsiteBeforePreview() {
  return (
    <div className="rv-mock-page rv-mock-before">
      <div className="rv-old-nav"><span>YOUR DENTAL PRACTICE</span><span className="rv-old-nav-link">HOME&nbsp;&nbsp;&nbsp; SERVICES&nbsp;&nbsp;&nbsp; ABOUT</span></div>
      <div className="rv-old-content">
        <span className="rv-old-kicker">WELCOME TO OUR WEBSITE</span>
        <h4>Welcome to our<br />dental practice</h4>
        <p>We provide a range of dental services for our patients. Get in touch to find out more or to book an appointment.</p>
        <span className="rv-old-button">READ MORE</span>
        <div className="rv-old-details"><span>General dentistry</span><span>Opening hours: contact us</span></div>
      </div>
      <div className="rv-old-image" aria-hidden="true"><span className="rv-old-image-sun" /><span className="rv-old-image-block" /></div>
      <div className="rv-preview-stamp">ILLUSTRATIVE “BEFORE” STATE</div>
    </div>
  );
}

function WebsiteAfterPreview() {
  return (
    <div className="rv-mock-page rv-mock-after">
      <div className="rv-new-nav">
        <span className="rv-new-brand">morrow<span> / DENTAL STUDIO</span></span>
        <div className="rv-new-links"><span>Our approach</span><span>Services</span><span>Visit</span></div>
        <span className="rv-new-nav-cta">Book a visit <ArrowUpRight size={11} /></span>
      </div>
      <div className="rv-new-content">
        <div className="rv-new-copy">
          <span className="rv-new-kicker"><span /> CARE, WITH CLARITY</span>
          <h4>Care that<br />fits your life.</h4>
          <p>A considered first step for your next appointment. Meet a team that keeps care clear and personal.</p>
          <span className="rv-new-button">Request an appointment <ArrowRight size={13} /></span>
          <span className="rv-new-link">Know what to expect <MoveRight size={12} /></span>
        </div>
        <div className="rv-clinic-art" aria-hidden="true">
          <span className="rv-clinic-art-ring rv-clinic-ring-one" />
          <span className="rv-clinic-art-ring rv-clinic-ring-two" />
          <span className="rv-clinic-art-cross"><i /><b /></span>
          <span className="rv-clinic-art-leaf rv-leaf-one" />
          <span className="rv-clinic-art-leaf rv-leaf-two" />
          <span className="rv-clinic-art-caption">ROOM TO FEEL AT EASE</span>
        </div>
      </div>
      <div className="rv-new-details"><span><Clock3 size={12} /> Clear information</span><span><ShieldCheck size={12} /> Calm, considered care</span><span>Designed for every screen</span></div>
      <div className="rv-preview-stamp">ILLUSTRATIVE “AFTER” CONCEPT</div>
    </div>
  );
}

function WebsiteTransformationDemo() {
  const [view, setView] = useState('after');

  return (
    <article className="rv-transform-demo">
      <div className="rv-transform-copy">
        <Reveal>
          <span className="rv-demo-index">01 <i /> WEBSITE TRANSFORMATION</span>
          <h3>Good design makes the next step feel natural.</h3>
          <p>Explore an illustrative transformation for a fictional dental practice. Choose a view to compare an unclear starting point with a calmer, more focused experience.</p>
          <p className="rv-demo-disclaimer"><ShieldCheck size={14} /> A design study only — not a real client website or a measured business result.</p>
        </Reveal>
      </div>

      <Reveal className="rv-transform-preview">
        <div className="rv-preview-chrome">
          <div className="rv-browser-dots" aria-hidden="true"><i /><i /><i /></div>
          <span className="rv-browser-address"><span className="rv-browser-lock" /> sample-dental.example</span>
          <div className="rv-browser-tools" aria-hidden="true"><span /><span /><span /></div>
        </div>
        <div className="rv-preview-switch-row">
          <span>FICTIONAL SAMPLE / DENTAL</span>
          <div className="rv-preview-switch" role="group" aria-label="Choose website design state">
            <button type="button" aria-pressed={view === 'before'} onClick={() => setView('before')}>Before</button>
            <button type="button" aria-pressed={view === 'after'} onClick={() => setView('after')}>After</button>
          </div>
        </div>
        <div className="rv-preview-screen">
          {view === 'before' ? <WebsiteBeforePreview /> : <WebsiteAfterPreview />}
        </div>
        <div className="rv-preview-caption" aria-live="polite" aria-atomic="true"><span>{view === 'before' ? 'Starting point' : 'A considered redesign'}</span><span>Concept · no real business data</span></div>
      </Reveal>
    </article>
  );
}

function BusinessAuditorDemo() {
  const [businessType, setBusinessType] = useState('clinic');
  const [report, setReport] = useState(null);

  const generate = (event) => {
    event.preventDefault();
    setReport(buildSampleAuditReport(businessType));
  };

  const changeBusinessType = (event) => {
    setBusinessType(event.target.value);
    setReport(null);
  };

  return (
    <article className="rv-demo-panel rv-auditor-demo">
      <div className="rv-demo-panel-head">
        <span className="rv-demo-index">02 <i /> BUSINESS AUDITOR</span>
        <DemoLabel>LOCAL SAMPLE</DemoLabel>
      </div>
      <div className="rv-demo-panel-intro">
        <h3>Spot a practical place to start.</h3>
        <p>Choose a fictional business type to see the kinds of website, enquiry and workflow questions an initial review might raise.</p>
      </div>

      <form className="rv-audit-controls" onSubmit={generate}>
        <label htmlFor="rv-business-type">Fictional business type</label>
        <div className="rv-audit-control-row">
          <select id="rv-business-type" value={businessType} onChange={changeBusinessType}>
            {Object.entries(AUDIT_SCENARIOS).map(([value, scenario]) => (
              <option value={value} key={value}>{scenario.label}</option>
            ))}
          </select>
          <button className="rv-button rv-button-primary rv-audit-button" type="submit">
            Generate example <ArrowRight size={15} />
          </button>
        </div>
      </form>

      {report ? (
        <div className="rv-audit-report" aria-live="polite">
          <div className="rv-report-heading">
            <div><span>ILLUSTRATIVE OPPORTUNITY MAP</span><strong>{report.businessLabel}</strong></div>
            <span className="rv-report-demo-chip">SAMPLE</span>
          </div>
          <div className="rv-report-items">
            {report.opportunities.map((opportunity, index) => (
              <div className="rv-report-item" key={opportunity.area}>
                <span className="rv-report-step">0{index + 1}</span>
                <div><span className="rv-report-area">{opportunity.area}</span><strong>{opportunity.title}</strong><p>{opportunity.detail}</p></div>
              </div>
            ))}
          </div>
          <div className="rv-report-first-step"><span>ONE POSSIBLE FIRST STEP</span><p>{report.firstStep}</p></div>
        </div>
      ) : (
        <div className="rv-audit-empty" aria-live="polite">
          <span className="rv-empty-spark"><Sparkles size={17} /></span>
          <div><strong>Your example report will appear here.</strong><p>It includes one illustrative idea for the website, enquiries and repetitive work.</p></div>
        </div>
      )}

      <p className="rv-demo-disclaimer rv-auditor-disclaimer"><ShieldCheck size={14} /> Simulated with fixed examples in your browser. This is not a live AI integration or a real business audit.</p>
    </article>
  );
}

function LeadPipelineDemo() {
  const [leads, setLeads] = useState(() => SAMPLE_PIPELINE_LEADS.map((lead) => ({ ...lead })));
  const [announcement, setAnnouncement] = useState('Sample pipeline ready. All leads are fictional.');

  const reset = () => {
    setLeads(SAMPLE_PIPELINE_LEADS.map((lead) => ({ ...lead })));
    setAnnouncement('Sample pipeline reset. All leads are fictional.');
  };
  const updateLead = (leadId, stage) => {
    const lead = leads.find((item) => item.id === leadId);
    const destination = PIPELINE_STAGES.find((item) => item.id === stage);
    if (!lead || !destination) return;
    setLeads((current) => moveSampleLead(current, leadId, stage));
    setAnnouncement(`${lead.name} moved to ${destination.label}.`);
  };

  return (
    <article className="rv-demo-panel rv-pipeline-demo">
      <div className="rv-demo-panel-head">
        <span className="rv-demo-index">03 <i /> LEAD MANAGEMENT</span>
        <button className="rv-reset-button" type="button" onClick={reset}><RefreshCw size={13} /> Reset example</button>
      </div>
      <div className="rv-demo-panel-intro rv-pipeline-intro">
        <div><h3>Keep every conversation moving.</h3><p>Move a sample enquiry from first contact to the next step. Stage counts update as you go.</p></div>
        <DemoLabel>FICTIONAL LEADS</DemoLabel>
      </div>

      <div className="rv-pipeline" role="region" aria-label="Interactive sample lead pipeline">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage === stage.id);
          return (
            <section className="rv-pipeline-stage" key={stage.id} aria-labelledby={`rv-stage-${stage.id}`}>
              <div className="rv-stage-heading">
                <div><span>{stage.marker}</span><h4 id={`rv-stage-${stage.id}`}>{stage.label}</h4></div>
                <span className="rv-stage-count" aria-live="polite">{stageLeads.length}</span>
              </div>
              <div className="rv-stage-leads">
                {stageLeads.length ? stageLeads.map((lead) => {
                  const stageIndex = PIPELINE_STAGES.findIndex((item) => item.id === lead.stage);
                  const nextStage = PIPELINE_STAGES[stageIndex + 1];
                  return (
                    <div className="rv-lead-sample" key={lead.id}>
                      <div className="rv-lead-sample-top"><span>{lead.type}</span><span className="rv-lead-sample-dot" /></div>
                      <strong>{lead.name}</strong>
                      <p>{lead.request}</p>
                      <label className="rv-stage-picker">
                        <span className="rv-sr-only">Move {lead.name} to stage</span>
                        <select value={lead.stage} onChange={(event) => updateLead(lead.id, event.target.value)}>
                          {PIPELINE_STAGES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </label>
                      {nextStage ? (
                        <button className="rv-next-stage" type="button" onClick={() => updateLead(lead.id, nextStage.id)}>
                          Move to {nextStage.label} <ArrowRight size={13} />
                        </button>
                      ) : <span className="rv-converted-note"><Check size={13} /> Example complete</span>}
                    </div>
                  );
                }) : <p className="rv-stage-empty">Move a sample lead here</p>}
              </div>
            </section>
          );
        })}
      </div>

      <p className="rv-sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="rv-pipeline-footnote"><ShieldCheck size={14} /><span>Sample entries are fictional, stored only in this page while it is open, and are not customer results.</span></div>
    </article>
  );
}

export default function DemosSection() {
  return (
    <section className="rv-section rv-demos" id="demos">
      <div className="rv-shell">
        <Reveal className="rv-section-heading">
          <span className="rv-eyebrow">Made tangible</span>
          <h2 className="rv-h2">See what a smarter setup can look like.</h2>
          <p className="rv-lead">Three small, interactive demonstrations. No customer data, paid APIs or live AI behind the scenes.</p>
        </Reveal>
        <WebsiteTransformationDemo />
        <div className="rv-demo-lab-grid">
          <BusinessAuditorDemo />
          <LeadPipelineDemo />
        </div>
      </div>
    </section>
  );
}

