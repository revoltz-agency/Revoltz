import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertCircle, CalendarClock, CircleDollarSign, CheckCircle2, ArrowUpRight } from 'lucide-react';

const KEYS={projects:'agencyos:project-tracker:v1',invoices:'agencyos:invoice-tracker:v1',packages:'agencyos:sales-packages:v1',deals:'agencyos:deal-tracker:v1',activity:'agencyos:client-activity-log:v1'};
const muted={color:'var(--viz-muted, #a1a1aa)',fontSize:13,lineHeight:1.6};
const card={border:'1px solid var(--viz-border, #333)',borderRadius:12,padding:16,background:'var(--viz-card, #151515)'};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))??fallback}catch{return fallback}}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function money(n){return '₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2})}
export default function DailyActionCenter(){
 const [data,setData]=useState({projects:[],invoices:[],packages:[],deals:{},activity:[]});
 const [done,setDone]=useState({});
 const [notice,setNotice]=useState('');
 const refresh=()=>setData({projects:read(KEYS.projects,[]),invoices:read(KEYS.invoices,[]),packages:read(KEYS.packages,[]),deals:read(KEYS.deals,{}),activity:read(KEYS.activity,[])});
 useEffect(()=>{refresh();const f=()=>refresh();window.addEventListener('focus',f);return()=>window.removeEventListener('focus',f)},[]);
 const actions=useMemo(()=>{
  const date=today(),items=[];
  (Array.isArray(data.projects)?data.projects:[]).forEach(p=>{if(!p||p.status==='Completed'||p.status==='On hold')return;if(p.dueDate&&p.dueDate<=date)items.push({id:'p-'+p.id,title:p.title||'Untitled project',type:'Project',detail:p.dueDate<date?'Overdue project task':'Due today',date:p.dueDate,priority:p.priority==='High'?0:1,amount:0})});
  (Array.isArray(data.invoices)?data.invoices:[]).forEach(i=>{if(!i||['Paid','Cancelled'].includes(i.status))return;if(i.dueDate&&i.dueDate<=date)items.push({id:'i-'+i.id,title:'Invoice '+(i.invoiceNo||'without reference'),type:'Invoice',detail:i.dueDate<date?'Payment overdue':'Payment due today',date:i.dueDate,priority:0,amount:Number(i.amount)||0})});
  const packages=Array.isArray(data.packages)?data.packages:[];
  packages.forEach(p=>{const d=(data.deals||{})[p.id]||{};if(['Won','Lost'].includes(d.stage))return;if(d.nextFollowUp&&d.nextFollowUp<=date)items.push({id:'d-'+p.id,title:p.businessName||p.name||p.company||'Lead follow-up',type:'Follow-up',detail:d.nextFollowUp<date?'Follow-up overdue':'Follow-up due today',date:d.nextFollowUp,priority:1,amount:Number(d.expectedValue)||0})});
  (Array.isArray(data.activity)?data.activity:[]).forEach(x=>{if(!x||!x.nextDate||!x.nextAction?.trim()||x.nextDate>date)return;items.push({id:'a-'+x.id,activityId:x.id,title:(x.client||'Client')+' — '+x.nextAction,type:'Client action',detail:x.nextDate<date?'Client action overdue':'Client action due today',date:x.nextDate,priority:0,amount:0})});
  return items.sort((a,b)=>a.date.localeCompare(b.date)||a.priority-b.priority);
 },[data]);
 const outstanding=useMemo(()=> (Array.isArray(data.invoices)?data.invoices:[]).filter(i=>i&&!['Paid','Cancelled'].includes(i.status)).reduce((s,i)=>s+Math.max(0,Number(i.amount)||0),0),[data]);
 const completed=actions.filter(a=>done[a.id]).length;
 const updateClientAction=(action,mode)=>{
  try{
   const current=JSON.parse(localStorage.getItem(KEYS.activity)||'[]');
   if(!Array.isArray(current))throw new Error('Invalid client activity data');
   const next=current.map(item=>{
    if(item?.id!==action.activityId)return item;
    if(mode==='complete')return {...item,nextAction:'',nextDate:'',outcome:'Connected',updatedAt:new Date().toISOString()};
    const base=item.nextDate||today();const d=new Date(base+'T12:00:00');d.setDate(d.getDate()+1);
    return {...item,nextDate:[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),updatedAt:new Date().toISOString()};
   });
   localStorage.setItem(KEYS.activity,JSON.stringify(next));refresh();
   setDone(s=>({...s,[action.id]:true}));
   setNotice(mode==='complete'?'Client action marked complete.':'Client action moved to tomorrow.');
  }catch{setNotice('Could not update this action. Open Client Activity Log and try again.')}
 };
 const button={border:'1px solid var(--viz-border, #444)',borderRadius:9,padding:'9px 12px',background:'var(--viz-card, #151515)',color:'var(--viz-text, #f5f5f5)',cursor:'pointer',font:'inherit',display:'inline-flex',gap:7,alignItems:'center'};
 return <section style={{display:'grid',gap:16,color:'var(--viz-text, #f5f5f5)'}}>
  <div><h2 style={{margin:'0 0 6px'}}>Daily Action Center</h2><p style={{...muted,margin:0}}>One place to see what needs attention today across projects, invoices, deal follow-ups and client activity.</p></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
   <div style={card}><p style={{...muted,margin:'0 0 7px'}}>Actions due</p><strong style={{fontSize:27}}>{actions.length}</strong></div>
   <div style={card}><p style={{...muted,margin:'0 0 7px'}}>Marked done today</p><strong style={{fontSize:27}}>{completed}</strong></div>
   <div style={card}><p style={{...muted,margin:'0 0 7px'}}>Unpaid invoice value</p><strong style={{fontSize:24}}>{money(outstanding)}</strong></div>
  </div>
  <div style={{...card,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong>Today’s priority list</strong><p style={{...muted,margin:'5px 0 0'}}>Items are generated from your saved browser records. Marking done here is a temporary checklist only.</p></div><button style={button} onClick={()=>{refresh();setNotice('Records refreshed.')}}><RefreshCw size={15}/> Refresh</button></div>
  {!actions.length?<div style={{...card,textAlign:'center',padding:28}}><CheckCircle2 size={30}/><h3 style={{margin:'10px 0 5px'}}>You’re clear for now</h3><p style={{...muted,margin:0}}>No overdue or due-today projects, invoices, deal follow-ups or client actions found in saved records.</p></div>:
   <div style={{display:'grid',gap:10}}>{actions.map(a=><article key={a.id} style={{...card,display:'flex',gap:12,alignItems:'flex-start',opacity:done[a.id] ? 0.65 : 1}}><button aria-label={done[a.id]?'Mark incomplete':'Mark done'} title={done[a.id]?'Mark incomplete':'Mark done'} onClick={()=>setDone(s=>({...s,[a.id]:!s[a.id]}))} style={{...button,padding:7}}>{done[a.id]?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}</button><div style={{flex:1,minWidth:0}}><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong style={{textDecoration:done[a.id]?'line-through':'none'}}>{a.title}</strong><span style={{...muted,border:'1px solid var(--viz-border, #444)',borderRadius:20,padding:'2px 8px'}}>{a.type}</span></div><p style={{...muted,margin:'5px 0 0'}}>{a.detail} · {a.date}</p></div>{a.type==='Client action'&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button type="button" onClick={()=>updateClientAction(a,'complete')} style={{...button,padding:'7px 9px',fontSize:12}}><CheckCircle2 size={14}/> Done</button><button type="button" onClick={()=>updateClientAction(a,'tomorrow')} style={{...button,padding:'7px 9px',fontSize:12}}><CalendarClock size={14}/> Tomorrow</button></div>}{a.amount>0&&<strong style={{whiteSpace:'nowrap'}}>{money(a.amount)}</strong>}</article>)}</div>}
  {notice&&<p role="status" style={muted}>{notice}</p>}
 </section>;
}
