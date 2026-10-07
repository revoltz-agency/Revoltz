import {
  Activity, Info, LayoutDashboard, Search, Send, Settings, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { DEMO_LEADS } from '../data/demoLeads.js';
import { scoreOpportunity } from '../lib/qualification.js';
import { ScorePill, initials, titleCaseStatus } from '../components/leadPrimitives.jsx';

// A static, non-interactive replica of the real AgencyOS workspace. It reuses
// the workspace's own primitives (ScorePill, initials, titleCaseStatus) and its
// own qualification engine, so the preview always matches the shipped product.
//
// Every number rendered here is computed from DEMO_LEADS — the fictional sample
// dataset that ships with AgencyOS. Nothing is invented, and the figures are
// labelled as a product preview so they are never mistaken for client results.
const statusOf = (lead) => lead.initialCRM?.status || 'NEW';

// Mirrors the "Worth a closer look" ordering on the real Dashboard page.
const PREVIEW_LEADS = [...DEMO_LEADS]
  .sort((a, b) => scoreOpportunity(b).score - scoreOpportunity(a).score)
  .slice(0, 4);

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Find Leads', icon: Search, active: false },
  { label: 'Leads', icon: Users, active: false },
  { label: 'Campaigns', icon: Send, active: false },
  { label: 'Settings', icon: Settings, active: false },
];

// Same definitions the AgencyOS dashboard uses, so the tiles stay in sync.
const CONTACTED_STATUSES = ['CONTACTED', 'REPLIED', 'INTERESTED', 'CALL BOOKED', 'PROPOSAL', 'WON'];

const KPIS = [
  { label: 'Total leads', value: DEMO_LEADS.length, caption: 'In the sample workspace' },
  { label: 'HOT leads', value: DEMO_LEADS.filter((lead) => scoreOpportunity(lead).score >= 80).length, caption: 'Score 80–100' },
  { label: 'Contacted', value: DEMO_LEADS.filter((lead) => CONTACTED_STATUSES.includes(statusOf(lead))).length, caption: 'Manual outreach' },
  { label: 'Won', value: DEMO_LEADS.filter((lead) => statusOf(lead) === 'WON').length, caption: 'Closed won' },
];

const STAGES = [
  { label: 'New & researched', statuses: ['NEW', 'RESEARCHED'], color: '#71a6ff' },
  { label: 'Outreach sent', statuses: ['CONTACTED'], color: '#ac8aff' },
  { label: 'In conversation', statuses: ['REPLIED', 'INTERESTED'], color: '#57d6aa' },
  { label: 'Meeting / proposal', statuses: ['CALL BOOKED', 'PROPOSAL'], color: '#5dc7dc' },
  { label: 'Won', statuses: ['WON'], color: '#b1dc68' },
].map((stage) => ({ ...stage, count: DEMO_LEADS.filter((lead) => stage.statuses.includes(statusOf(lead))).length }));

const statusClass = (status) => {
  if (status === 'WON') return 'rv-mock-status is-won';
  if (['CALL BOOKED', 'PROPOSAL', 'INTERESTED'].includes(status)) return 'rv-mock-status is-hot';
  return 'rv-mock-status';
};

export default function ProductPreview() {
  const maxStage = Math.max(1, ...STAGES.map((stage) => stage.count));

  return (
    <figure className="rv-mock-wrap">
      <span className="rv-mock-glow" aria-hidden="true" />
      <div
        className="rv-mock"
        role="img"
        aria-label="Product preview of the AgencyOS workspace: sample pipeline totals, lead-stage bars, and a scored lead list. All figures come from the fictional sample dataset, not from client results."
      >
        <div className="rv-mock-chrome" aria-hidden="true">
          <span className="rv-mock-dots"><i /><i /><i /></span>
          <span className="rv-mock-url">revoltz.ai/agencyos</span>
          <span className="rv-mock-chip"><i /> Demo data</span>
        </div>

        <div className="rv-mock-body">
          <aside className="rv-mock-side" aria-hidden="true">
            <div className="rv-mock-brand">
              <span className="rv-mock-brand-mark"><Sparkles size={13} strokeWidth={2} /></span>
              Agency<b>OS</b>
            </div>
            <nav className="rv-mock-nav">
              {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
                <span className={`rv-mock-navitem ${active ? 'is-active' : ''}`} key={label}>
                  <Icon size={14} strokeWidth={1.8} /><span>{label}</span>
                </span>
              ))}
            </nav>
            <div className="rv-mock-side-foot">
              <ShieldCheck size={11} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 5 }} />
              Your data stays in your workspace
            </div>
          </aside>

          <div className="rv-mock-main">
            <div className="rv-mock-topbar" aria-hidden="true">
              <span>Workspace / <b>Dashboard</b></span>
              <span className="rv-mock-env"><i /> OpenStreetMap available</span>
              <span className="rv-mock-avatar">A</span>
            </div>

            <div className="rv-mock-content">
              <div className="rv-mock-kpis" aria-hidden="true">
                {KPIS.map(({ label, value, caption }) => (
                  <div className="rv-mock-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{caption}</small>
                  </div>
                ))}
              </div>

              <p className="rv-mock-sample-note" aria-hidden="true">
                <Info size={11} /> Sample workspace · {DEMO_LEADS.length} fictional sample records
              </p>

              <div className="rv-mock-grid">
                <section className="rv-mock-card" aria-hidden="true">
                  <div className="rv-mock-card-head">
                    <strong>Lead stages</strong>
                    <span><Activity size={10} style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: 4 }} />Pipeline</span>
                  </div>
                  <div className="rv-mock-bars">
                    {STAGES.map((stage, index) => (
                      <div className="rv-mock-bar-row" key={stage.label}>
                        <span>{stage.label}<b>{stage.count}</b></span>
                        <div className="rv-mock-track">
                          <i style={{ width: `${Math.max(6, (stage.count / maxStage) * 100)}%`, background: stage.color, animationDelay: `${120 + index * 90}ms` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rv-mock-card" aria-hidden="true">
                  <div className="rv-mock-card-head">
                    <strong>Worth a closer look</strong>
                    <span>Best next opportunities</span>
                  </div>
                  <div className="rv-mock-table">
                    <div className="rv-mock-thead">
                      <span>Business</span><span>Category</span><span>Status</span><span style={{ justifySelf: 'end' }}>Score</span>
                    </div>
                    {PREVIEW_LEADS.map((lead) => (
                      <div className="rv-mock-tr" key={lead.id}>
                        <span className="rv-mock-name"><i>{initials(lead.name)}</i><span>{lead.name}</span></span>
                        <span className="rv-mock-meta">{lead.category} · {lead.city}</span>
                        <span className={statusClass(statusOf(lead))}>{titleCaseStatus(statusOf(lead))}</span>
                        <span className="rv-mock-score"><ScorePill lead={lead} compact /></span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>

      <span className="rv-mock-badge" aria-hidden="true">
        <ScorePill lead={PREVIEW_LEADS[0]} />
        <span>Top prospect scored automatically</span>
      </span>

      <figcaption className="rv-mock-note">
        <Info size={13} />
        <span>
          <strong>Product preview.</strong> Every figure above is calculated by AgencyOS from the
          {' '}{DEMO_LEADS.length} fictional sample records that ship with the product — not from client results.
        </span>
      </figcaption>
    </figure>
  );
}
