import { useState } from 'react';
import { generateGeminiJson } from '../lib/geminiLeadFinder.js';
import { ClipboardList, Sparkles, LoaderCircle, Copy, Check, AlertCircle } from 'lucide-react';

const industries = ['Gaming café', 'Restaurant / café', 'Gym / fitness studio', 'Salon / barber', 'Real estate agency', 'Accounting / CA firm', 'Retail shop', 'Other'];
const inputStyle = { width: '100%', border: '1px solid var(--viz-border, #333)', borderRadius: 10, background: 'var(--viz-card, #151515)', color: 'var(--viz-text, #f5f5f5)', padding: '11px 12px', font: 'inherit', boxSizing: 'border-box' };
const labelStyle = { display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 };
const muted = { color: 'var(--viz-muted, #a1a1aa)', fontSize: 13, lineHeight: 1.55 };

export default function BusinessAuditor({ apiKey = '' }) {
  const [form, setForm] = useState({ businessName: '', industry: 'Gaming café', location: 'Pune, India', website: '', process: '', problem: '', budget: 'Low / start small' });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  function update(key, value) { setForm((old) => ({ ...old, [key]: value })); }

  async function generate(event) {
    event.preventDefault(); setError(''); setReport(null);
    if (!apiKey.trim()) { setError('Add your Gemini API key in Settings first, then return here.'); return; }
    if (!form.businessName.trim()) { setError('Enter the business name.'); return; }
    setLoading(true);
    const prompt = [
      'You are a practical small-business automation consultant for Revoltz AI.',
      'Create a realistic beginner-friendly automation audit using only details supplied below. Do not claim you visited or verified a website. Label assumptions. Prefer low-cost simple tools; do not invent facts, savings, or guaranteed revenue. Do not recommend controlling TVs/devices unless exact model and remote wake capability are confirmed.',
      'Business: ' + form.businessName.slice(0, 160),
      'Industry: ' + form.industry,
      'Location: ' + form.location.slice(0, 160),
      'Website supplied (not verified): ' + (form.website.slice(0, 500) || 'Not supplied'),
      'Current process: ' + (form.process.slice(0, 1500) || 'Not supplied'),
      'Biggest problem: ' + (form.problem.slice(0, 1500) || 'Not supplied'),
      'Budget preference: ' + form.budget,
      'Return valid JSON with: summary (string), opportunities (array of 3-5 objects with title, problem, solution, tools, difficulty, priority, estimatedSetup), firstStep (string), questionsToAsk (array of strings), proposal (string), caveat (string). Make it useful, non-pushy and realistic.'
    ].join('\n');
    try {
      const parsed = await generateGeminiJson({ apiKey, prompt });
      if (!Array.isArray(parsed.opportunities)) throw new Error('The report was incomplete. Please try again.');
      setReport(parsed);
    } catch (e) { setError(String(e?.message || 'Audit failed. Please try again.').slice(0, 500)); }
    finally { setLoading(false); }
  }

  function fullText() {
    if (!report) return '';
    const lines = ['REVOLTZ AI — BUSINESS AUTOMATION AUDIT', 'Business: ' + form.businessName, 'Industry: ' + form.industry, 'Location: ' + form.location, '', report.summary || ''];
    (report.opportunities || []).forEach((item, i) => lines.push('', (i + 1) + '. ' + (item.title || 'Opportunity') + ' [' + (item.priority || 'Review') + ']', 'Problem: ' + (item.problem || ''), 'Solution: ' + (item.solution || ''), 'Tools: ' + (item.tools || ''), 'Difficulty: ' + (item.difficulty || 'Review'), 'Setup effort: ' + (item.estimatedSetup || 'Not estimated')));
    lines.push('', 'FIRST STEP: ' + (report.firstStep || ''), '', 'QUESTIONS TO ASK', ...(report.questionsToAsk || []).map((q) => '• ' + q), '', 'DRAFT MESSAGE: ' + (report.proposal || ''), '', 'VALIDATION NOTE: ' + (report.caveat || 'Verify details before promising implementation.'));
    return lines.join('\n');
  }
  async function copyReport() {
    try { await navigator.clipboard.writeText(fullText()); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy was blocked by the browser. You can select and copy the report manually.'); }
  }

  return <section style={{ display: 'grid', gap: 22, maxWidth: 980 }}>
    <header style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 14, padding: 12 }}><ClipboardList size={23} /></div>
      <div><div style={{ fontSize: 11, letterSpacing: '.14em', fontWeight: 700, color: 'var(--viz-muted, #a1a1aa)', marginBottom: 6 }}>REVOLTZ AI · CLIENT ACQUISITION</div><h1 style={{ fontSize: 32, lineHeight: 1.15, margin: '0 0 8px' }}>AI Business Auditor</h1><p style={{ ...muted, margin: 0 }}>Turn a few business details into practical automation ideas, discovery questions and a draft offer. Review everything before sharing it.</p></div>
    </header>
    <div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 14, padding: 16 }}>
      <form onSubmit={generate} style={{ display: 'grid', gap: 15 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: 14 }}>
          <label style={labelStyle}>Business name *<input style={inputStyle} maxLength={160} value={form.businessName} onChange={(e) => update('businessName', e.target.value)} placeholder="e.g. ABC Gaming Café" required /></label>
          <label style={labelStyle}>Industry<select style={inputStyle} value={form.industry} onChange={(e) => update('industry', e.target.value)}>{industries.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label style={labelStyle}>Location<input style={inputStyle} maxLength={160} value={form.location} onChange={(e) => update('location', e.target.value)} /></label>
          <label style={labelStyle}>Website (optional)<input style={inputStyle} maxLength={500} value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://example.com" /></label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>How does the business work today?<textarea style={{ ...inputStyle, minHeight: 85, resize: 'vertical' }} maxLength={1500} value={form.process} onChange={(e) => update('process', e.target.value)} placeholder="e.g. Customers book on WhatsApp; staff track sessions in a notebook." /></label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Biggest problem (optional)<textarea style={{ ...inputStyle, minHeight: 75, resize: 'vertical' }} maxLength={1500} value={form.problem} onChange={(e) => update('problem', e.target.value)} placeholder="What takes the most time or causes mistakes?" /></label>
          <label style={labelStyle}>Budget preference<select style={inputStyle} value={form.budget} onChange={(e) => update('budget', e.target.value)}>{['Low / start small', 'Moderate', 'Flexible if value is clear', 'Not discussed yet'].map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}><button type="submit" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 10, border: '1px solid var(--viz-border, #555)', padding: '0 16px', background: 'var(--viz-accent-bg, #27272a)', color: 'var(--viz-text, #fff)', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>{loading ? <LoaderCircle size={16} /> : <Sparkles size={16} />}{loading ? 'Generating audit…' : 'Generate business audit'}</button><span style={muted}>AI output is a draft. Verify facts and feasibility before quoting.</span></div>
      </form>
    </div>
    {error && <div role="alert" style={{ border: '1px solid #9f4545', borderRadius: 10, padding: 12, display: 'flex', gap: 9 }}><AlertCircle size={17} /><span style={{ fontSize: 13 }}>{error}</span></div>}
    {report && <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><div><div style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 700, color: 'var(--viz-muted, #a1a1aa)' }}>GENERATED REPORT</div><h2 style={{ fontSize: 22, margin: '5px 0 0' }}>Automation opportunities</h2></div><button type="button" onClick={copyReport} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 12px', background: 'transparent', color: 'var(--viz-text, #fff)', cursor: 'pointer' }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied report' : 'Copy full report'}</button></div>
      <div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 12, padding: 15, lineHeight: 1.65 }}>{report.summary}</div>
      {(report.opportunities || []).map((item, i) => <article key={i} style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 12, padding: 15, display: 'grid', gap: 9 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><h3 style={{ margin: 0, fontSize: 17 }}>{i + 1}. {item.title || 'Opportunity'}</h3><span style={{ fontSize: 11, border: '1px solid var(--viz-border, #333)', borderRadius: 99, padding: '4px 8px' }}>{item.priority || 'Review priority'}</span></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}><div><strong style={{ fontSize: 12 }}>Problem</strong><p style={{ ...muted, margin: '5px 0 0' }}>{item.problem}</p></div><div><strong style={{ fontSize: 12 }}>Suggested solution</strong><p style={{ ...muted, margin: '5px 0 0' }}>{item.solution}</p></div><div><strong style={{ fontSize: 12 }}>Tools</strong><p style={{ ...muted, margin: '5px 0 0' }}>{item.tools}</p></div></div><div style={muted}>Difficulty: <strong>{item.difficulty || 'Review'}</strong> · Setup effort: <strong>{item.estimatedSetup || 'Not estimated'}</strong></div></article>)}
      <div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 12, padding: 15 }}><h3 style={{ margin: '0 0 7px', fontSize: 16 }}>Best first step</h3><p style={{ ...muted, margin: 0 }}>{report.firstStep}</p>{report.questionsToAsk?.length > 0 && <><h3 style={{ margin: '16px 0 7px', fontSize: 15 }}>Questions to ask the owner</h3><ul style={{ ...muted, margin: 0, paddingLeft: 20 }}>{report.questionsToAsk.map((q, i) => <li key={i}>{q}</li>)}</ul></>}</div>
      <div style={{ border: '1px solid var(--viz-border, #333)', borderRadius: 12, padding: 15 }}><h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Draft offer message</h3><p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, margin: 0 }}>{report.proposal}</p></div>
      <p style={muted}><AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{report.caveat || 'Confirm technical feasibility and exact scope before promising implementation.'}</p>
    </div>}
  </section>;
}
