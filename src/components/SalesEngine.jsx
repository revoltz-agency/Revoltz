import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardCheck, Copy, Download, FileText, LoaderCircle, PackageCheck, Save, ShieldCheck, Sparkles, Target, Trash2 } from 'lucide-react';
import { generateAgencyJson } from '../lib/agencyAi.js';

const STORAGE_KEY = 'agencyos:sales-packages:v1';
const input = { width: '100%', border: '1px solid var(--viz-border, #333)', borderRadius: 10, background: 'var(--viz-card, #151515)', color: 'var(--viz-text, #f5f5f5)', padding: '11px 12px', font: 'inherit', boxSizing: 'border-box' };
const muted = { color: 'var(--viz-muted, #a1a1aa)', fontSize: 13, lineHeight: 1.6 };
const card = { border: '1px solid var(--viz-border, #333)', borderRadius: 14, padding: 16, display: 'grid', gap: 12 };
function readSaved() { try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 100) : []; } catch { return []; } }
function makeText(pkg) {
  return [
    'REVOLTZ AI — DRAFT SALES PACKAGE',
    'Business: ' + pkg.businessName,
    'Service: ' + pkg.service,
    'Opportunity: ' + pkg.opportunity,
    'Suggested price: ' + pkg.price,
    'Timeline: ' + pkg.timeline,
    '',
    'PROPOSAL',
    pkg.proposal,
    '',
    'DELIVERABLES',
    ...(pkg.deliverables || []).map((x) => '• ' + x),
    '',
    'DISCOVERY QUESTIONS',
    ...(pkg.questions || []).map((x) => '• ' + x),
    '',
    'FIRST MESSAGE (DRAFT)',
    pkg.outreach,
    '',
    'ASSUMPTIONS / TO VERIFY',
    ...(pkg.assumptions || []).map((x) => '• ' + x),
    '',
    'Review and confirm scope, costs and feasibility before sharing.'
  ].join('\n');
}

export default function SalesEngine({ leads = [], getCrm, apiKey = '' }) {
  const [selectedId, setSelectedId] = useState('');
  const [service, setService] = useState('Website');
  const [priceStyle, setPriceStyle] = useState('Budget-friendly, one-time starter offer');
  const [extraContext, setExtraContext] = useState('');
  const [packages, setPackages] = useState(readSaved);
  const [activePackageId, setActivePackageId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(packages.slice(0, 100))); } catch {} }, [packages]);
  const qualified = useMemo(() => leads.filter((lead) => !lead.demo && getCrm?.(lead)?.status !== 'DO NOT CONTACT'), [leads, getCrm]);
  const selected = qualified.find((lead) => String(lead.placeId || lead.id) === selectedId) || qualified[0] || null;
  const activePackage = packages.find((item) => item.id === activePackageId) || packages[0] || null;

  function savePackage(pkg) {
    setPackages((current) => [pkg, ...current.filter((item) => item.id !== pkg.id)].slice(0, 100));
    setActivePackageId(pkg.id);
    setNotice('Draft saved in this browser. Review it before sending.');
  }
  async function generate(event) {
    event.preventDefault(); setError(''); setNotice('');
    if (!selected) { setError('Add a real business lead to Leads first. Fictional demo leads are excluded.'); return; }
    setLoading(true);
    const crm = getCrm?.(selected) || {};
    const prompt = [
      'You are a practical, ethical sales strategist for a small beginner-friendly digital agency called Revoltz AI in India.',
      'Create a personalized sales package for the business using only supplied evidence. Do not claim to have visited the website or verified details. Never invent a problem as fact; label hypotheses. No guaranteed outcomes, fake scarcity, manipulative claims, or fabricated metrics. Use INR and realistic ranges or mark price as a suggested starting point that needs manual validation. Keep scope simple and affordable. No automatic sending.',
      'Business name: ' + String(selected.name || '').slice(0, 160),
      'Category: ' + String(selected.category || '').slice(0, 120),
      'City/address: ' + String(selected.city || selected.address || '').slice(0, 200),
      'Website (unverified): ' + String(selected.website || 'Not provided').slice(0, 500),
      'Public phone (not a permission to message): ' + String(selected.phone || 'Not provided').slice(0, 80),
      'Lead score: ' + String(selected.score ?? 'Not available'),
      'CRM status: ' + String(crm.status || 'NEW'),
      'Chosen service: ' + service,
      'Pricing approach: ' + priceStyle,
      'Extra context from user: ' + extraContext.slice(0, 1500),
      'Return valid JSON with fields: opportunity (short description), whyItMayFit (string clearly separating evidence from hypothesis), packageName (string), price (INR suggested price/range or explicitly "Confirm after discovery"), timeline (string), proposal (client-ready but honest 150-250 words), deliverables (array 3-6 strings), exclusions (array 2-4 strings), questions (array 3-5 strings), outreach (short respectful first-contact draft under 100 words), assumptions (array of uncertainties to verify), nextStep (one action).'
    ].join('\n');
    try {
      const result = await generateAgencyJson({ prompt, geminiApiKey: apiKey });
      if (!result || typeof result.proposal !== 'string' || !Array.isArray(result.deliverables)) throw new Error('AI response was incomplete. Try again.');
      const pkg = {
        id: globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2),
        createdAt: new Date().toISOString(),
        businessName: String(selected.name || 'Business').slice(0, 160),
        leadId: String(selected.placeId || selected.id || ''),
        service,
        status: 'Draft',
        approved: false,
        ...result,
      };
      savePackage(pkg);
    } catch (e) { setError(String(e?.message || 'Could not generate package. Check AI configuration in Settings.').slice(0, 500)); }
    finally { setLoading(false); }
  }
  function updateActive(patch) {
    if (!activePackage) return;
    setPackages((current) => current.map((item) => item.id === activePackage.id ? { ...item, ...patch } : item));
  }
  async function copyPackage() {
    try { await navigator.clipboard.writeText(makeText(activePackage)); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setError('Clipboard was blocked. Select and copy the package text manually.'); }
  }
  function downloadPackage() {
    const blob = new Blob([makeText(activePackage)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'revoltz-sales-package-' + (activePackage.businessName || 'lead').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  return <div style={{ display: 'grid', gap: 22, maxWidth: 1080 }}>
    <header style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 14, padding: 12 }}><Target size={23} /></div>
      <div><div style={{ fontSize: 11, letterSpacing: '.14em', fontWeight: 700, color: 'var(--viz-muted, #a1a1aa)', marginBottom: 6 }}>REVOLTZ AI · SALES WORKFLOW</div><h1 style={{ fontSize: 32, lineHeight: 1.15, margin: '0 0 8px' }}>AI Sales Engine</h1><p style={{ ...muted, margin: 0 }}>Turn a qualified lead into a tailored offer, scope, price hypothesis and first-contact draft. Nothing is sent automatically.</p></div>
    </header>
    <form onSubmit={generate} style={card}>
      <div><div style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 700, color: 'var(--viz-muted, #a1a1aa)' }}>BUILD A SALES PACKAGE</div><h2 style={{ margin: '5px 0 0', fontSize: 20 }}>Start with one real lead</h2></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 14 }}>
        <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 }}>Business lead<select style={input} value={selectedId || (selected ? String(selected.placeId || selected.id) : '')} onChange={(e) => setSelectedId(e.target.value)}><option value="">Choose a saved lead</option>{qualified.map((lead) => <option key={String(lead.placeId || lead.id)} value={String(lead.placeId || lead.id)}>{lead.name} — {lead.city || lead.category || 'Lead'}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 }}>Service to offer<select style={input} value={service} onChange={(e) => setService(e.target.value)}>{['Website', 'AI chatbot / FAQ assistant', 'Lead generation system', 'Workflow automation', 'Social media content', 'Business automation audit', 'Custom small-business tool'].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 }}>Pricing approach<select style={input} value={priceStyle} onChange={(e) => setPriceStyle(e.target.value)}>{['Budget-friendly, one-time starter offer', 'Small setup fee plus monthly support', 'Value-based, confirm after discovery', 'Do not suggest price yet'].map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      {selected && <div style={{ ...muted, border: '1px solid var(--viz-border, #333)', borderRadius: 10, padding: 12 }}><strong style={{ color: 'var(--viz-text, #f5f5f5)' }}>{selected.name}</strong> · {selected.category || 'Category not provided'} · {selected.city || selected.address || 'Location not provided'}<br />Website: {selected.website || 'Not provided'}<br />Lead status: {getCrm?.(selected)?.status || 'NEW'} · Details are not independently verified here.</div>}
      <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 }}>Extra context (optional)<textarea style={{ ...input, minHeight: 85, resize: 'vertical' }} maxLength={1500} value={extraContext} onChange={(e) => setExtraContext(e.target.value)} placeholder="e.g. They replied to my message and asked for a low-cost website. Their exact needs are not confirmed yet." /></label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><button type="submit" disabled={loading || !qualified.length} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 10, border: '1px solid var(--viz-border, #555)', padding: '0 16px', background: 'var(--viz-accent-bg, #27272a)', color: 'var(--viz-text, #fff)', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>{loading ? <LoaderCircle size={16} /> : <Sparkles size={16} />}{loading ? 'Building package…' : 'Generate sales package'}</button><span style={muted}>AI suggestions are drafts, not verified facts or a quote.</span></div>
      {!qualified.length && <p style={muted}>Add a real business through Find Leads first. Fictional demo entries are excluded.</p>}
    </form>
    {error && <div role="alert" style={{ border: '1px solid #9f4545', borderRadius: 10, padding: 12, fontSize: 13 }}>{error}</div>}
    {notice && <div role="status" style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 10, padding: 12, fontSize: 13 }}>{notice}</div>}
    {packages.length > 0 && <section style={card}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}><div><div style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 700, color: 'var(--viz-muted, #a1a1aa)' }}>YOUR LOCAL LIBRARY</div><h2 style={{ margin: '5px 0 0', fontSize: 20 }}>Saved sales packages</h2></div><span style={muted}>{packages.length} saved in this browser</span></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{packages.map((pkg) => <button key={pkg.id} type="button" onClick={() => setActivePackageId(pkg.id)} style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 10, padding: '10px 12px', background: activePackage?.id === pkg.id ? 'var(--viz-accent-bg, #27272a)' : 'transparent', color: 'var(--viz-text, #f5f5f5)', textAlign: 'left', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 13 }}>{pkg.businessName}</strong><span style={muted}>{pkg.service} · {pkg.status || 'Draft'}</span></button>)}</div></section>}
    {activePackage && <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}><div><div style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 700, color: 'var(--viz-muted, #a1a1aa)' }}>SALES PACKAGE · {activePackage.status || 'DRAFT'}</div><h2 style={{ margin: '5px 0', fontSize: 22 }}>{activePackage.packageName || activePackage.businessName}</h2><p style={{ ...muted, margin: 0 }}>{activePackage.businessName} · {activePackage.service} · {activePackage.price || 'Price to confirm'} · {activePackage.timeline || 'Timeline to confirm'}</p></div><button type="button" onClick={() => { setPackages((current) => current.filter((item) => item.id !== activePackage.id)); setActivePackageId(''); }} style={{ display: 'inline-flex', gap: 7, alignItems: 'center', border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '9px 11px', background: 'transparent', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}><Trash2 size={14} /> Delete</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}><div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 11, padding: 13 }}><strong>Opportunity hypothesis</strong><p style={muted}>{activePackage.opportunity || activePackage.whyItMayFit}</p></div><div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 11, padding: 13 }}><strong>Recommended next step</strong><p style={muted}>{activePackage.nextStep || 'Confirm the business need before quoting.'}</p></div></div>
      <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 }}>Proposal — editable draft<textarea value={activePackage.proposal || ''} onChange={(e) => updateActive({ proposal: e.target.value, approved: false, status: 'Draft' })} maxLength={8000} rows={8} style={{ ...input, resize: 'vertical', lineHeight: 1.6 }} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}>{[['Deliverables', activePackage.deliverables], ['Exclusions', activePackage.exclusions], ['Questions to confirm', activePackage.questions], ['Assumptions to verify', activePackage.assumptions]].map(([title, list]) => <div key={title} style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 11, padding: 13 }}><strong>{title}</strong><ul style={{ ...muted, paddingLeft: 18, marginBottom: 0 }}>{(Array.isArray(list) ? list : []).map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}</div>
      <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 }}>First-contact draft — review and edit<textarea value={activePackage.outreach || ''} onChange={(e) => updateActive({ outreach: e.target.value, approved: false, status: 'Draft' })} maxLength={2000} rows={4} style={{ ...input, resize: 'vertical', lineHeight: 1.6 }} /></label>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}><button type="button" onClick={() => { updateActive({ approved: true, status: 'Approved for review' }); setNotice('Marked approved for your review only. No message has been sent.'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--viz-border, #555)', borderRadius: 9, padding: '10px 12px', background: 'var(--viz-accent-bg, #27272a)', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}><ClipboardCheck size={15} /> Approve draft</button><button type="button" onClick={copyPackage} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 12px', background: 'transparent', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy package'}</button><button type="button" onClick={downloadPackage} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 12px', background: 'transparent', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}><Download size={15} /> Download .txt</button><button type="button" onClick={() => { savePackage(activePackage); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 12px', background: 'transparent', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}><Save size={15} /> Save changes</button></div>
      <div style={{ ...muted, display: 'flex', gap: 8, alignItems: 'flex-start' }}><ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />Approval is only an internal review marker. It does not send messages, approve pricing, or confirm feasibility. Verify the scope and consent before outreach.</div>
    </section>}
  </div>;
}
