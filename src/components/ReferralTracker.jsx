import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Users, Gift, Trash2 } from 'lucide-react';

const KEY='agencyos:referral-tracker:v1';
const muted={color:'var(--viz-muted, #a1a1aa)',fontSize:13,lineHeight:1.55};
const field={width:'100%',boxSizing:'border-box',border:'1px solid var(--viz-border, #333)',borderRadius:9,padding:'10px 11px',background:'var(--viz-card, #151515)',color:'var(--viz-text, #f5f5f5)',font:'inherit'};
const card={border:'1px solid var(--viz-border, #333)',borderRadius:12,padding:14};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const read=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return []}};
const statuses=['New','Contacted','Qualified','Converted','Not proceeding'];
const blank={referrer:'',prospect:'',service:'Website',date:today(),status:'New',estimatedValue:'',reward:'',notes:''};

export default function ReferralTracker(){
 const [items,setItems]=useState(read);
 const [form,setForm]=useState(blank);
 const [filter,setFilter]=useState('All');
 const [notice,setNotice]=useState('');
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(items))}catch{setNotice('Browser storage is full; changes may not persist.')}},[items]);
 const visible=useMemo(()=>items.filter(x=>filter==='All'||x.status===filter).sort((a,b)=>(b.date||'').localeCompare(a.date||'')),[items,filter]);
 const converted=items.filter(x=>x.status==='Converted');
 const pipeline=items.filter(x=>!['Converted','Not proceeding'].includes(x.status)).reduce((s,x)=>s+Number(x.estimatedValue||0),0);
 const won=converted.reduce((s,x)=>s+Number(x.estimatedValue||0),0);
 function add(e){e.preventDefault();const val=form.estimatedValue===''?0:Number(form.estimatedValue);const reward=form.reward===''?0:Number(form.reward);if(!form.referrer.trim()||!form.prospect.trim()||!Number.isFinite(val)||val<0||!Number.isFinite(reward)||reward<0){setNotice('Enter the referrer, prospect, and valid non-negative amounts.');return}setItems(prev=>[{...form,id:globalThis.crypto?.randomUUID?.()||String(Date.now()),referrer:form.referrer.trim(),prospect:form.prospect.trim(),estimatedValue:Math.round(val*100)/100,reward:Math.round(reward*100)/100},...prev]);setForm({...blank,date:today()});setNotice('Referral saved in this browser.')}
 function update(id,patch){setItems(prev=>prev.map(x=>x.id===id?{...x,...patch}:x))}
 function exportCsv(){const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const rows=[['Referrer','Prospect','Service','Date','Status','Estimated deal value INR','Referral reward INR','Notes'],...items.map(x=>[x.referrer,x.prospect,x.service,x.date,x.status,x.estimatedValue,x.reward,x.notes])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(esc).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='agencyos-referrals.csv';a.click();URL.revokeObjectURL(url)}
 return <section style={{display:'grid',gap:16,maxWidth:1100,color:'var(--viz-text, #f5f5f5)'}}>
  <header style={{display:'flex',gap:12,alignItems:'flex-start'}}><div style={{...card,padding:12}}><Gift size={23}/></div><div><div style={{...muted,letterSpacing:'.13em',fontWeight:700}}>REVOLTZ AI · GROWTH</div><h1 style={{fontSize:30,margin:'4px 0 6px'}}>Referral Tracker</h1><p style={{...muted,margin:0}}>Track who referred each prospect, follow referral progress, and record estimated deal value and any agreed reward.</p></div></header>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}>{[['Referrals',items.length],['In-progress pipeline',money(pipeline)],['Converted referrals',converted.length],['Value from converted deals',money(won)]].map(([label,value])=><div key={label} style={card}><div style={muted}>{label}</div><div style={{fontSize:22,fontWeight:750,marginTop:6}}>{value}</div></div>)}</div>
  {notice&&<p role="status" style={{...muted,...card,margin:0}}>{notice}</p>}
  <form onSubmit={add} style={{...card,display:'grid',gap:12}}><h2 style={{fontSize:19,margin:0}}>Add referral</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,190px),1fr))',gap:10}}>
   <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Referred by<input required maxLength={140} style={field} value={form.referrer} onChange={e=>setForm({...form,referrer:e.target.value})} placeholder="Client or partner name"/></label>
   <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Prospect / business<input required maxLength={140} style={field} value={form.prospect} onChange={e=>setForm({...form,prospect:e.target.value})} placeholder="Business being referred"/></label>
   <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Service<input maxLength={120} style={field} value={form.service} onChange={e=>setForm({...form,service:e.target.value})} placeholder="Website"/></label>
   <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Referral date<input required type="date" style={field} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
   <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Estimated deal value (₹)<input type="number" min="0" max="100000000" step="0.01" style={field} value={form.estimatedValue} onChange={e=>setForm({...form,estimatedValue:e.target.value})} placeholder="0"/></label>
   <label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Referral reward (₹)<input type="number" min="0" max="100000000" step="0.01" style={field} value={form.reward} onChange={e=>setForm({...form,reward:e.target.value})} placeholder="0"/></label>
  </div><label style={{display:'grid',gap:6,fontSize:13,fontWeight:650}}>Notes<textarea rows={2} maxLength={1000} style={{...field,resize:'vertical'}} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Next step, agreed terms, or context"/></label><button type="submit" style={{justifySelf:'start',display:'inline-flex',gap:7,alignItems:'center',border:0,borderRadius:9,padding:'10px 13px',background:'var(--viz-accent, #3977dc)',color:'#fff',cursor:'pointer'}}><Plus size={16}/> Save referral</button></form>
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><label style={{display:'grid',gap:5,fontSize:13}}>Status filter<select style={{...field,width:'auto',minWidth:170}} value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label><button type="button" onClick={exportCsv} disabled={!items.length} style={{...field,width:'auto',display:'inline-flex',gap:7,alignItems:'center',cursor:'pointer',marginLeft:'auto'}}><Download size={15}/> Export CSV</button></div>
  {!visible.length?<div style={{...card,textAlign:'center',padding:24}}><Users size={26}/><h2 style={{fontSize:19}}>No referrals yet</h2><p style={{...muted,margin:0}}>Start with a client or partner who introduces a potential customer.</p></div>:<div style={{display:'grid',gap:10}}>{visible.map(x=><article key={x.id} style={{...card,display:'grid',gap:10}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}><div style={{flex:1,minWidth:200}}><strong style={{fontSize:17}}>{x.prospect}</strong><div style={muted}>Referred by {x.referrer} · {x.service} · {x.date}</div>{x.notes&&<p style={{...muted,margin:'5px 0 0'}}>{x.notes}</p>}<div style={{...muted,marginTop:7}}>Estimated deal: {money(x.estimatedValue)} · Reward: {money(x.reward)}</div></div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><select aria-label={'Status for '+x.prospect} style={{...field,width:'auto',minWidth:160}} value={x.status} onChange={e=>update(x.id,{status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select><button type="button" aria-label={'Delete '+x.prospect} onClick={()=>{if(confirm('Delete this referral record?'))setItems(prev=>prev.filter(y=>y.id!==x.id))}} style={{...field,width:'auto',padding:9,cursor:'pointer'}}><Trash2 size={15}/></button></div></div></article>)}</div>}
  <p style={muted}>Stored in this browser only. Referral rewards are manual records; this tracker does not create contracts, make payments, or verify deal revenue.</p>
 </section>;
}
