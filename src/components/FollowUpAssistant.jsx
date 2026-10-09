import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Clipboard, Copy, MessageCircle, RefreshCw } from 'lucide-react';

const PACKAGES_KEY = 'agencyos:sales-packages:v1';
const DEALS_KEY = 'agencyos:deal-tracker:v1';
const muted = { color: 'var(--viz-muted, #a1a1aa)', fontSize: 13, lineHeight: 1.55 };
const field = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 11px', background: 'var(--viz-card, #151515)', color: 'var(--viz-text, #f5f5f5)', font: 'inherit' };
function read(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); return value ?? fallback; } catch { return fallback; } }
function today() { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
function defaultMessage(pkg, stage) {
  const name = String(pkg.businessName || 'there').trim().split(/\s+/)[0];
  if (stage === 'Meeting booked') return `Hi ${name}, looking forward to our conversation. Is there anything specific you'd like me to prepare beforehand?`;
  if (stage === 'Proposal sent' || stage === 'Negotiation') return `Hi ${name}, just following up on the proposal I shared. Happy to clarify the scope or adjust it to fit your priorities. Would a quick discussion be useful?`;
  if (stage === 'Contacted') return `Hi ${name}, I wanted to gently follow up on my earlier message. If improving your online presence or workflow is a current priority, I’d be happy to share a few practical ideas. No worries if the timing isn’t right.`;
  if (stage === 'Ready to contact') return `Hi ${name}, I’m reaching out from Revoltz AI. We help businesses explore practical website and automation improvements. Would it be alright if I shared one or two ideas relevant to your business?`;
  return `Hi ${name}, hope you’re doing well. I wanted to check whether this is still something you'd like to explore. If priorities have changed, no problem at all.`;
}
export default function FollowUpAssistant() {
  const [packages, setPackages] = useState(() => { const p=read(PACKAGES_KEY,[]); return Array.isArray(p)?p:[]; });
  const [deals, setDeals] = useState(() => { const d=read(DEALS_KEY,{}); return d && typeof d==='object' && !Array.isArray(d)?d:{}; });
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('Needs attention');
  const refresh = () => { const p=read(PACKAGES_KEY,[]); const d=read(DEALS_KEY,{}); setPackages(Array.isArray(p)?p:[]); setDeals(d && typeof d==='object' && !Array.isArray(d)?d:{}); };
  useEffect(() => { const onFocus=()=>refresh(); window.addEventListener('focus',onFocus); return ()=>window.removeEventListener('focus',onFocus); }, []);
  const rows = useMemo(() => packages.map(pkg => {
    const tracking = deals[pkg.id] || { stage: pkg.status === 'Approved for review' ? 'Ready to contact' : 'Draft', nextFollowUp: '' };
    const due = tracking.nextFollowUp || '';
    const closed = ['Won','Lost','Draft'].includes(tracking.stage);
    const attention = !closed && (!due || due <= today());
    return { ...pkg, tracking, due, attention };
  }).filter(row => filter==='All' ? !['Won','Lost'].includes(row.tracking.stage) : filter==='Needs attention' ? row.attention : row.due && row.due>today() && !['Won','Lost'].includes(row.tracking.stage)), [packages,deals,filter]);
  const selected = rows.find(row=>row.id===selectedId) || rows[0] || null;
  const draft = selected ? (drafts[selected.id] ?? defaultMessage(selected, selected.tracking.stage)) : '';
  async function copy() { try { await navigator.clipboard.writeText(draft); setNotice('Draft copied. Review it before sending.'); } catch { setNotice('Clipboard access was blocked; select and copy the draft manually.'); } }
  function updateDeal(id, patch) {
    const next={...deals,[id]:{...(deals[id]||{}),...patch}};
    setDeals(next);
    try { localStorage.setItem(DEALS_KEY,JSON.stringify(next)); setNotice('Follow-up date saved to Deal Pipeline.'); } catch { setNotice('Could not save in this browser.'); }
  }
  return <div style={{display:'grid',gap:20,maxWidth:1050}}>
    <header style={{display:'flex',gap:13,alignItems:'flex-start'}}><div style={{border:'1px solid var(--viz-border, #333)',borderRadius:13,padding:12}}><CalendarClock size={23}/></div><div><div style={{...muted,letterSpacing:'.14em',fontWeight:700}}>REVOLTZ AI · DAILY SALES ACTIONS</div><h1 style={{fontSize:32,margin:'4px 0 7px'}}>Follow-up Assistant</h1><p style={{...muted,margin:0}}>See which deals need attention, set the next follow-up and prepare a respectful message. Nothing is sent automatically.</p></div></header>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}>
      {[['Needs attention',packages.filter(p=>{const t=deals[p.id]||{};return !['Won','Lost','Draft'].includes(t.stage)&&(!t.nextFollowUp||t.nextFollowUp<=today());}).length],['Upcoming',packages.filter(p=>{const t=deals[p.id]||{};return t.nextFollowUp>today()&&!['Won','Lost'].includes(t.stage);}).length],['Active sales packages',packages.filter(p=>!['Won','Lost'].includes((deals[p.id]||{}).stage)).length]].map(([label,value])=><div key={label} style={{border:'1px solid var(--viz-border, #333)',borderRadius:12,padding:14}}><div style={muted}>{label}</div><div style={{fontSize:27,fontWeight:750,marginTop:6}}>{value}</div></div>)}
    </div>
    <section style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}><select aria-label="Filter follow-ups" style={{...field,width:'auto',minWidth:210}} value={filter} onChange={e=>{setFilter(e.target.value);setSelectedId('');}}><option>Needs attention</option><option>Upcoming</option><option>All</option></select><button type="button" onClick={()=>{refresh();setNotice('Pipeline refreshed.');}} style={{display:'inline-flex',gap:7,alignItems:'center',border:'1px solid var(--viz-border, #333)',borderRadius:9,padding:'9px 12px',background:'transparent',color:'var(--viz-text, #fff)',cursor:'pointer'}}><RefreshCw size={15}/> Refresh pipeline</button></section>
    {notice&&<div role="status" style={{...muted,border:'1px solid var(--viz-border, #333)',borderRadius:9,padding:10}}>{notice}</div>}
    {!rows.length?<section style={{border:'1px dashed var(--viz-border, #444)',borderRadius:14,padding:28,textAlign:'center'}}><Check size={25}/><h2 style={{fontSize:20,margin:'8px 0'}}>You’re all caught up</h2><p style={{...muted,maxWidth:470,margin:'0 auto'}}>No deals match this view. Create a package in Sales Engine and track its stage in Deal Pipeline. Set a follow-up date to organise upcoming actions.</p></section>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:12,alignItems:'start'}}>
      <section style={{display:'grid',gap:9}}>{rows.map(row=><button type="button" key={row.id} onClick={()=>setSelectedId(row.id)} style={{textAlign:'left',padding:13,border:'1px solid '+(selected?.id===row.id?'var(--viz-accent, #6ea8fe)':'var(--viz-border, #333)'),borderRadius:11,background:'var(--viz-card, #151515)',color:'var(--viz-text, #f5f5f5)',cursor:'pointer'}}><div style={{fontWeight:750}}>{row.businessName||'Business'}</div><div style={{...muted,marginTop:4}}>{row.tracking.stage||'Draft'}</div><div style={{...muted,marginTop:5}}>{row.due ? (row.due<today()?'Overdue · ':'Due · ')+row.due : row.attention?'No follow-up date set':'Date not set'}</div></button>)}</section>
      {selected&&<article style={{border:'1px solid var(--viz-border, #333)',borderRadius:13,padding:15,display:'grid',gap:13}}><div><div style={{fontWeight:750,fontSize:18}}>{selected.businessName||'Business'}</div><div style={muted}>{selected.service||'Service'} · {selected.tracking.stage}</div></div>
        <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Next follow-up date<input type="date" min={today()} style={field} value={selected.tracking.nextFollowUp||''} onChange={e=>updateDeal(selected.id,{nextFollowUp:e.target.value})}/></label>
        <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Message draft<textarea rows={7} maxLength={2500} style={{...field,resize:'vertical',lineHeight:1.6}} value={draft} onChange={e=>setDrafts(current=>({...current,[selected.id]:e.target.value}))}/></label>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" onClick={copy} style={{display:'inline-flex',gap:7,alignItems:'center',border:'1px solid var(--viz-border, #333)',borderRadius:9,padding:'9px 12px',background:'transparent',color:'var(--viz-text, #fff)',cursor:'pointer'}}><Copy size={15}/> Copy draft</button><button type="button" onClick={()=>{setDrafts(current=>({...current,[selected.id]:defaultMessage(selected,selected.tracking.stage)}));setNotice('Draft reset for the current deal stage.');}} style={{display:'inline-flex',gap:7,alignItems:'center',border:'1px solid var(--viz-border, #333)',borderRadius:9,padding:'9px 12px',background:'transparent',color:'var(--viz-text, #fff)',cursor:'pointer'}}><MessageCircle size={15}/> Reset draft</button></div>
        <p style={{...muted,margin:0}}>This is a template, not an AI-generated claim. Personalise it, check the recipient’s contact preferences, and send it yourself only when appropriate.</p>
      </article>}
    </div>}
  </div>;
}
