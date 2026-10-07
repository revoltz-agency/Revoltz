import {
  Activity, LayoutDashboard, Search, Send, Settings, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { DEMO_LEADS } from '../data/demoLeads.js';
import { ScorePill, initials, titleCaseStatus } from '../components/leadPrimitives.jsx';

// A static, non-interactive replica of the real AgencyOS workspace. It reuses
// the workspace's own primitives (ScorePill, initials, titleCaseStatus) and its
// sample data, so the preview always matches the shipped product.
const PREVIEW_LEADS = [DEMO_LEADS[5], DEMO_LEADS[7], DEMO_LEADS[1], DEMO_LEADS[4]];

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Find Leads', icon: Search, active: false },
  { label: 'Leads', icon: Users, active: false },
  { label: 'Campaigns', icon: Send, active: false },
  { label: 'Settings', icon: Settings, active: false },
];

const KPIS = [
  { label: 'Total leads', value: '148', caption: 'In your workspace' },
  { label: 'HOT leads', value: '23', caption: 'Score 80–100' },
  { label: 'Contacted', value: '61', caption: 'Manual outreach' },
  { label: 'Won', value: '12', caption: 'Closed won' },
];

const STAGES = [
  { label: 'New & researched', count: 64, color: '#71a6ff' },
  { label: 'Outreach sent', count: 41, color: '#ac8aff' },
  { label: 'In conversation', count: 22, color: '#57d6aa' },
  { label: 'Meeting / proposal', count: 11, color: '#5dc7dc' },
  { label: 'Won', count: 12, color: '#b1dc68' },
];

const statusClass = (status) => {
  if (status === 'WON') return 'rv-mock-status is-won';
  if (['CALL BOOKED', 'PROPOSAL', 'INTERESTED'].includes(status)) return 'rv-mock-status is-hot';
  return 'rv-mock-status';
};

export default function ProductPreview() {
  const maxStage = Math.max(...STAGES.map((stage) => stage.count));

  return (
    <figure className="rv-mock-wrap">
      <span className="rv-mock-glow" aria-hidden="true" />
      <div
        className="rv-mock"
        role="img"
        aria-label="AgencyOS workspace preview: pipeline totals, lead-stage bars, and a scored lead list with categories and pipeline statuses."
      >
        <div className="rv-mock-chrome" aria-hidden="true">
          <span className="rv-mock-dots"><i /><i /><i /></span>
          <span className="rv-mock-url">revoltz.ai/agencyos</span>
          <span className="rv-mock-chip"><i /> Live workspace</span>
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
                        <span className={statusClass(lead.initialCRM.status)}>{titleCaseStatus(lead.initialCRM.status)}</span>
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

      <figcaption className="rv-mock-badge" aria-hidden="true">
        <ScorePill lead={DEMO_LEADS[5]} />
        <span>Top prospect scored automatically</span>
      </figcaption>
    </figure>
  );
}
