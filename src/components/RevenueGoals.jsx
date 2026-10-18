import { useEffect, useMemo, useRef, useState } from 'react';
import { Target, Save, TrendingUp, RefreshCw } from 'lucide-react';
import { mergeRecordsById, saveOrganizationModulePatch } from '../lib/moduleDataSync.js';

const GOAL_KEY = 'agencyos:revenue-goals:v1';
const INVOICE_KEY = 'agencyos:invoice-tracker:v1';
const muted = { color:'var(--viz-muted, #a1a1aa)', fontSize:13, lineHeight:1.6 };
const field = { width:'100%', boxSizing:'border-box', border:'1px solid var(--viz-border, #333)', borderRadius:9, padding:'10px 11px', background:'var(--viz-card, #151515)', color:'var(--viz-text, #f5f5f5)', font:'inherit' };
const card = { border:'1px solid var(--viz-border, #333)', borderRadius:12, padding:16, background:'var(--viz-card, #151515)' };
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) ?? fallback; } catch { return fallback; } }
function monthNow() { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function money(n) { return '₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2}); }

export default function RevenueGoals() {
 const [goal,setGoal] = useState(()=>read(GOAL_KEY,{month:monthNow(),target:'50000'}));
 const [invoices,setInvoices] = useState([]);
 const [notice,setNotice] = useState('');
 const [syncStatus,setSyncStatus] = useState('checking');
 const [syncAttempt,setSyncAttempt] = useState(0);
 const cloudReady = useRef(false);
 const invoiceRef = useRef(invoices); invoiceRef.current = invoices;
 const goalRef = useRef(goal); goalRef.current = goal;
 const saveQueue = useRef(Promise.resolve());
 async function refresh() {
   try {
     const response=await fetch('/api/workspace/modules/finance_reports/data',{credentials:'include',cache:'no-store'});
     if(!response.ok) throw new Error('Cloud sync unavailable');
     const payload=await response.json();
     if(!payload.state||typeof payload.state!=='object'||Array.isArray(payload.state)) throw new Error('Invalid cloud state');
     const localInvoices=read(INVOICE_KEY,[]);
     const merged=mergeRecordsById(Array.isArray(localInvoices)?localInvoices:[],payload.state.invoiceTracker);
     setInvoices(merged);
     const cloudGoal=payload.state.revenueGoals;
     if(cloudGoal&&typeof cloudGoal==='object'&&!Array.isArray(cloudGoal)){
       const next={month:typeof cloudGoal.month==='string'?cloudGoal.month:monthNow(),target:String(Math.max(0,Number(cloudGoal.target)||0))};
       setGoal(next);try{localStorage.setItem(GOAL_KEY,JSON.stringify(next))}catch{}
     }
     cloudReady.current=true;setSyncStatus('synced');
   } catch(error) {
     setInvoices(()=>{const data=read(INVOICE_KEY,[]);return Array.isArray(data)?data:[]});
     setSyncStatus('unavailable');
     console.warn('[AgencyOS] Revenue Goals cloud sync unavailable:',error?.message||error);
   }
 }
 useEffect(()=>{cloudReady.current=false;setSyncStatus('checking');refresh();const onFocus=()=>refresh();window.addEventListener('focus',onFocus);return()=>{cloudReady.current=false;window.removeEventListener('focus',onFocus)};},[syncAttempt]);
 const totals = useMemo(()=>{
   const monthInvoices=invoices.filter(i=>String(i.issueDate||'').slice(0,7)===goal.month && i.status!=='Cancelled');
   const billed=monthInvoices.reduce((s,i)=>s+Math.max(0,Number(i.amount)||0),0);
   const collected=monthInvoices.filter(i=>i.status==='Paid').reduce((s,i)=>s+Math.max(0,Number(i.amount)||0),0);
   const target=Math.max(0,Number(goal.target)||0);
   return {billed,collected,target,progress:target?Math.min(100,Math.round(collected/target*100)):0,remaining:Math.max(0,target-collected),count:monthInvoices.length};
 },[invoices,goal]);
 async function save(e){e.preventDefault();const next={month:goal.month||monthNow(),target:String(Math.max(0,Number(goal.target)||0))};try{localStorage.setItem(GOAL_KEY,JSON.stringify(next))}catch{}setGoal(next);if(!cloudReady.current){setNotice('Goal saved locally. Cloud sync is unavailable; retry before relying on another device.');return}setSyncStatus('saving');saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveOrganizationModulePatch('finance_reports',{revenueGoals:next}));try{await saveQueue.current;setSyncStatus('synced');setNotice('Revenue goal saved to your workspace.')}catch(error){setSyncStatus('failed');setNotice('Goal saved locally, but cloud sync failed. Retry cloud sync.');console.warn('[AgencyOS] Revenue Goals cloud save failed:',error?.message||error)}}
 return <section style={{display:'grid',gap:16,color:'var(--viz-text, #f5f5f5)'}}>
  <div><h2 style={{margin:'0 0 6px',display:'flex',alignItems:'center',gap:9}}><Target size={23}/> Revenue Goals</h2><p style={{...muted,margin:0}}>Set a monthly collection target and track progress using your Invoice Tracker records.</p><button type="button" aria-live="polite" onClick={()=>{if(['unavailable','failed'].includes(syncStatus)){setSyncStatus('checking');setSyncAttempt(v=>v+1)}else refresh()}} style={{...field,width:'auto',marginTop:9,fontSize:11,cursor:'pointer'}}>{({checking:'CLOUD SYNC · CHECKING',synced:'CLOUD SYNC · SAVED',saving:'CLOUD SYNC · SAVING',unavailable:'CLOUD SYNC · LOCAL ONLY · RETRY',failed:'CLOUD SYNC · SAVE FAILED · RETRY'})[syncStatus]}</button></div>
  <form onSubmit={save} style={{...card,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,alignItems:'end'}}>
   <label style={{display:'grid',gap:7}}>Target month<input style={field} type="month" value={goal.month||monthNow()} onChange={e=>setGoal(p=>({...p,month:e.target.value}))} required /></label>
   <label style={{display:'grid',gap:7}}>Monthly collection target (₹)<input style={field} type="number" min="0" step="1" value={goal.target} onChange={e=>setGoal(p=>({...p,target:e.target.value}))} required /></label>
   <button type="submit" style={{...field,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><Save size={16}/> Save goal</button>
  </form>
  <div style={{...card,display:'grid',gap:14}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><p style={{...muted,margin:'0 0 4px'}}>Collected this month</p><h2 style={{fontSize:30,margin:0}}>{money(totals.collected)}</h2></div><div style={{textAlign:'right'}}><p style={{...muted,margin:'0 0 4px'}}>Target</p><strong style={{fontSize:20}}>{money(totals.target)}</strong></div></div>
   <div style={{height:12,borderRadius:99,background:'var(--viz-border, #333)',overflow:'hidden'}}><div style={{height:'100%',width:totals.progress+'%',background:'var(--viz-accent, #a3e635)',transition:'width .2s'}}/></div>
   <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><strong>{totals.progress}% achieved</strong><span style={muted}>{money(totals.remaining)} left to target</span></div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
   <div style={card}><p style={{...muted,margin:'0 0 8px'}}>Billed this month</p><strong style={{fontSize:22}}>{money(totals.billed)}</strong></div>
   <div style={card}><p style={{...muted,margin:'0 0 8px'}}>Invoices this month</p><strong style={{fontSize:22}}>{totals.count}</strong></div>
   <div style={card}><p style={{...muted,margin:'0 0 8px'}}>Still to collect</p><strong style={{fontSize:22}}>{money(Math.max(0,totals.billed-totals.collected))}</strong></div>
  </div>
  <p style={muted}>Only invoices marked <b>Paid</b> count toward collected revenue. Figures use your workspace’s invoice records when cloud sync is connected; this is a planning tool, not formal accounting.</p>
  <div><button onClick={()=>{refresh();setNotice('Invoice totals refreshed.')}} style={{...field,width:'auto',cursor:'pointer',display:'inline-flex',gap:8,alignItems:'center'}}><RefreshCw size={16}/> Refresh totals</button>{notice&&<span role="status" style={{marginLeft:12,...muted}}>{notice}</span>}</div>
 </section>;
}
