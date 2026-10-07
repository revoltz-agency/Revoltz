import { scoreOpportunity } from '../lib/qualification.js';

// Small lead-formatting primitives shared by the AgencyOS workspace and the
// REVOLTZ AI marketing site (product preview). Extracted so both surfaces
// render identical badges without duplicating logic.
export function titleCaseStatus(value) {
  return String(value || '').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

export function ScorePill({ lead, compact = false }) {
  const result = scoreOpportunity(lead);
  return <span className={`score-pill score-${result.tier} ${compact ? 'score-compact' : ''}`} title={`${result.rawScore} raw points normalized to ${result.score}/100`}><span className="score-pill-dot" />{result.score}<span className="score-pill-suffix">/100</span></span>;
}
