import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Download, Filter, Handshake, MessageSquare, Save, TrendingUp } from 'lucide-react';
import { mergeDealTrackerState, mergeSalesPackagesState } from '../lib/financeReportsSync.js';

import { saveOrganizationModulePatch } from '../lib/moduleDataSync.js';
const PACKAGES_KEY = 'agencyos:sales-packages:v1';
const DEALS_KEY = 'agencyos:deal-tracker:v1';
const STAGES = ['Draft', 'Ready to contact', 'Contacted', 'Meeting booked', 'Proposal sent', 'Negotiation', 'Won', 'Lost'];
const field = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '9px 10px', background: 'var(--viz-card, #151515)', color: 'var(--viz-text, #f5f5f5)', font: 'inherit' };
const muted = { color: 'var(--viz-muted, #a1a1aa)', fontSize: 12, lineHeight: 1.5 };
function read(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); return v ?? fallback; } catch { return fallback; } }
function money(value) { const raw = String(value ?? '').trim(); if (!raw || !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(raw)) return 0; const n = Number(raw); return Number.isFinite(n) && n > 0 && n <= 100000000 ? n : 0; }

export default function DealTracker() {
  const [packages, setPackages] = useState(() => { const p = read(PACKAGES_KEY, []); return Array.isArray(p) ? p : []; });
  const [deals, setDeals] = useState(() => { const d = read(DEALS_KEY, {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; });
  const packagesRef = useRef(packages); packagesRef.current = packages;
  const dealsRef = useRef(deals); dealsRef.current = deals;
  const cloudReady = useRef(false); const saveQueue = useRef(Promise.resolve());
  const [syncAttempt, setSyncAttempt] = useState(0); const [syncStatus, setSyncStatus] = useState('checking');
  const [filter, setFilter] = useState('All');
  const [notice, setNotice] = useState('');
  useEffect(() => { const refresh = () => { const p = read(PACKAGES_KEY, []); setPackages(Array.isArray(p) ? p : []); }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  useEffect(() => { try { localStorage.setItem(DEALS_KEY, JSON.stringify(deals)); } catch {} }, [deals]);
  useEffect(() => {
    let active = true; cloudReady.current = false; setSyncStatus('checking');
    (async () => {
      try {
        const response = await fetch('/api/workspace/modules/growth_sales/data', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error('Cloud sync unavailable');
        const payload = await response.json();
        if (!active || !payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) throw new Error('Invalid cloud state');
        setPackages(mergeSalesPackagesState(packagesRef.current, payload.state.salesPackages));
        setDeals(mergeDealTrackerState(dealsRef.current, payload.state.dealTracker));
        cloudReady.current = true; setSyncStatus('connected');
      } catch (error) {
        if (active) { setSyncStatus('unavailable'); console.warn('[AgencyOS] Deal Pipeline cloud sync unavailable:', error?.message || error); }
      }
    })();
    return () => { active = false; cloudReady.current = false; };
  }, [syncAttempt]);
  useEffect(() => {
    if (!cloudReady.current) return undefined;
    const timer = window.setTimeout(() => {
      const state = { dealTracker: deals };
      saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
        if (!cloudReady.current) return;
        setSyncStatus('saving');
        await saveOrganizationModulePatch('growth_sales', state);
        setSyncStatus('synced');
      }).catch(error => { setSyncStatus('failed'); console.warn('[AgencyOS] Deal Pipeline cloud save failed:', error?.message || error); });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [deals]);
  const rows = useMemo(() => packages.map((pkg) => ({ ...pkg, tracking: deals[pkg.id] || { stage: pkg.status === 'Approved for review' ? 'Ready to contact' : 'Draft', expectedValue: '', nextFollowUp: '', notes: '' } })).filter((p) => filter === 'All' || p.tracking.stage === filter), [packages, deals, filter]);
  const update = (id, patch) => setDeals((current) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }));
  const stats = useMemo(() => {
    const all = packages.map((p) => ({ ...p, t: deals[p.id] || { stage: p.status === 'Approved for review' ? 'Ready to contact' : 'Draft', expectedValue: '' } }));
    return { total: all.length, active: all.filter((p) => !['Won', 'Lost'].includes(p.t.stage)).length, won: all.filter((p) => p.t.stage === 'Won').length, pipeline: all.filter((p) => !['Won', 'Lost'].includes(p.t.stage)).reduce((s, p) => s + money(p.t.expectedValue), 0), wonValue: all.filter((p) => p.t.stage === 'Won').reduce((s, p) => s + money(p.t.expectedValue), 0) };
  }, [packages, deals]);
  function exportCsv() {
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = [['Business','Service','Stage','Expected value INR','Next follow-up','Notes','Proposal'], ...rows.map((p) => [p.businessName, p.service, p.tracking.stage, p.tracking.expectedValue, p.tracking.nextFollowUp, p.tracking.notes, p.proposal])].map((r) => r.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'revoltz-deal-pipeline.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return <div style={{ display: 'grid', gap: 20, maxWidth: 1100 }}>
    <header style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}><div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 13, padding: 12 }}><Handshake size={23} /></div><div><div style={{ ...muted, letterSpacing: '.14em', fontWeight: 700 }}>REVOLTZ AI · CLIENT CONVERSION</div><h1 style={{ fontSize: 32, margin: '4px 0 7px' }}>Deal Pipeline</h1><p style={{ ...muted, margin: 0 }}>Track each AI sales package from first draft to won or lost. Nothing is sent automatically.</p><button type="button" aria-live="polite" aria-label={['unavailable','failed'].includes(syncStatus)?'Retry cloud sync':'Sales workspace cloud sync status'} onClick={()=>{if(['unavailable','failed'].includes(syncStatus)){setSyncStatus('checking');setSyncAttempt(v=>v+1)}}} style={{marginTop:9,border:'1px solid var(--viz-border, #333)',borderRadius:999,padding:'5px 9px',background:'transparent',color:'var(--viz-muted, #a1a1aa)',fontSize:11,cursor:['unavailable','failed'].includes(syncStatus)?'pointer':'default'}}>{({checking:'CLOUD SYNC · CHECKING',connected:'CLOUD SYNC · CONNECTED',saving:'CLOUD SYNC · SAVING',synced:'CLOUD SYNC · SAVED',unavailable:'CLOUD SYNC · LOCAL ONLY · RETRY',failed:'CLOUD SYNC · SAVE FAILED · RETRY'})[syncStatus]}</button></div></header>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10 }}>
      {[['Sales packages', stats.total, 'Saved proposal drafts'], ['Active deals', stats.active, 'Not won or lost'], ['Potential pipeline', '₹' + stats.pipeline.toLocaleString('en-IN'), 'Based on values you enter'], ['Deals won', stats.won, 'Marked won manually'], ['Won value', '₹' + stats.wonValue.toLocaleString('en-IN'), 'Based on values you enter']].map(([title, value, sub]) => <div key={title} style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 12, padding: 14 }}><div style={muted}>{title}</div><div style={{ fontSize: 24, fontWeight: 750, margin: '7px 0' }}>{value}</div><div style={muted}>{sub}</div></div>)}
    </section>
    <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, ...muted }}><Filter size={15} /><select style={{ ...field, width: 'auto', minWidth: 175 }} value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label><button type="button" onClick={exportCsv} disabled={!rows.length} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 12px', background: 'transparent', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}><Download size={15} /> Export pipeline CSV</button></section>
    {notice && <div role="status" style={{ ...muted, border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: 10 }}>{notice}</div>}
    {!rows.length ? <section style={{ border: '1px dashed var(--viz-border, #444)', borderRadius: 14, padding: 28, textAlign: 'center' }}><TrendingUp size={25} style={{ marginBottom: 8 }} /><h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Your pipeline starts with a proposal</h2><p style={{ ...muted, maxWidth: 460, margin: '0 auto' }}>Generate a package in Sales Engine first. It will appear here automatically when this page refreshes.</p></section> :
      <section style={{ display: 'grid', gap: 12 }}>{rows.map((pkg) => <article key={pkg.id} style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 14, padding: 15, display: 'grid', gap: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><div style={{ fontWeight: 750, fontSize: 17 }}>{pkg.businessName || 'Business'}</div><div style={muted}>{pkg.service || 'Service'} · {pkg.packageName || 'Sales package'}</div><div style={{ ...muted, marginTop: 6 }}>{String(pkg.proposal || '').slice(0, 180)}{String(pkg.proposal || '').length > 180 ? '…' : ''}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, ...muted }}><CircleDollarSign size={15} /> {pkg.price || 'Price not set'}</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 650 }}>Deal stage<select style={field} value={pkg.tracking.stage} onChange={(e) => { update(pkg.id, { stage: e.target.value }); setNotice('Deal stage saved.'); }} >{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 650 }}>Expected deal value (₹)<input style={field} type="number" min="0" max="100000000" placeholder="Enter after discussing scope" value={pkg.tracking.expectedValue || ''} onChange={(e) => update(pkg.id, { expectedValue: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 650 }}><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CalendarDays size={13} /> Next follow-up</span><input style={field} type="date" value={pkg.tracking.nextFollowUp || ''} onChange={(e) => update(pkg.id, { nextFollowUp: e.target.value })} /></label>
        </div>
        <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 650 }}><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MessageSquare size={13} /> Private notes</span><textarea style={{ ...field, resize: 'vertical' }} rows={2} maxLength={3000} value={pkg.tracking.notes || ''} onChange={(e) => update(pkg.id, { notes: e.target.value })} placeholder="What did they say? What do you need to confirm next?" /></label>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span style={muted}>Saved automatically in this browser.</span><button type="button" onClick={() => { try { localStorage.setItem(DEALS_KEY, JSON.stringify(deals)); setNotice('Deal details saved.'); } catch { setNotice('Could not save in this browser.'); } }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--viz-border, #333)', borderRadius: 8, padding: '8px 10px', background: 'transparent', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}><Save size={14} /> Save now</button></div>
      </article>)}</section>}
    <div style={{ ...muted, display: 'flex', gap: 7, alignItems: 'flex-start' }}><CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 2 }} /> Only numeric values you enter count toward totals; suggested AI price ranges are never treated as revenue. Mark a deal “Won” only after the client confirms. Cloud sync status above shows whether this pipeline is saved to your account. Confirm it says “CLOUD SYNC · SAVED” before switching devices.</div>
  </div>;
}
