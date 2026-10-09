import { useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Download, Wallet } from 'lucide-react';

const INVOICES_KEY='agencyos:invoice-tracker:v1';
const EXPENSES_KEY='agencyos:expense-tracker:v1';
const card={border:'1px solid var(--viz-border, #333)',borderRadius:13,padding:15,background:'var(--viz-card, #151515)'};
const muted={color:'var(--viz-muted, #a1a1aa)',fontSize:13,lineHeight:1.55};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const currentMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
function read(key){try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function validAmount(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:0}
function monthOf(v){return typeof v==='string'?v.slice(0,7):''}
export default function CashFlowPlanner(){
 const [month,setMonth]=useState(currentMonth());
 const invoices=useMemo(()=>read(INVOICES_KEY),[month]);
 const expenses=useMemo(()=>read(EXPENSES_KEY),[month]);
 const paid=invoices.filter(x=>x.status==='Paid'&&monthOf(x.issueDate)===month).reduce((s,x)=>s+validAmount(x.amount),0);
 const expected=invoices.filter(x=>['Sent','Overdue','Partially paid'].includes(x.status)&&monthOf(x.dueDate)===month).reduce((s,x)=>s+validAmount(x.amount),0);
 const unpaid=invoices.filter(x=>['Sent','Overdue','Partially paid'].includes(x.status)).reduce((s,x)=>s+validAmount(x.amount),0);
 const businessExpenses=expenses.filter(x=>x.type==='Business'&&monthOf(x.date)===month).reduce((s,x)=>s+validAmount(x.amount),0);
 const personalExpenses=expenses.filter(x=>x.type==='Personal'&&monthOf(x.date)===month).reduce((s,x)=>s+validAmount(x.amount),0);
 const net=paid+expected-businessExpenses;
 const rows=[
  {label:'Paid invoices recorded',value:paid,icon:ArrowUpRight,detail:'Paid invoices issued this month'},
  {label:'Expected collections',value:expected,icon:Wallet,detail:'Unpaid invoices due this month'},
  {label:'Business expenses',value:businessExpenses,icon:ArrowDownRight,detail:'Business expenses dated this month'},
  {label:'Estimated net cash',value:net,icon:Activity,detail:'Paid + expected collections − business expenses'},
 ];
 function exportCsv(){const csv=[['Cash flow summary','Amount INR'],...rows.map(x=>[x.label,x.value]),['All unpaid invoices',unpaid],['Personal expenses (excluded from net)',personalExpenses],['Month',month]].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='agencyos-cash-flow-'+month+'.csv';a.click();URL.revokeObjectURL(url)}
 return <section style={{display:'grid',gap:16,maxWidth:1100,color:'var(--viz-text, #f5f5f5)'}}>
  <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}><div style={{display:'flex',gap:12,alignItems:'flex-start'}}><div style={{...card,padding:12}}><Activity size={23}/></div><div><div style={{...muted,letterSpacing:'.13em',fontWeight:700}}>REVOLTZ AI · BUSINESS ADMIN</div><h1 style={{fontSize:30,margin:'4px 0 6px'}}>Cash Flow Planner</h1><p style={{...muted,margin:0,maxWidth:690}}>See recorded paid invoices, expected collections and logged expenses in one place. This is a planning estimate, not a bank balance or accounting statement.</p></div></div><button type="button" onClick={exportCsv} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 13px',borderRadius:9,border:'1px solid var(--viz-border, #333)',background:'transparent',color:'inherit',font:'inherit',cursor:'pointer'}}><Download size={16}/> Export summary</button></header>
  <div style={{...card,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><label style={{fontSize:13,fontWeight:650}}>Reporting month <input aria-label="Reporting month" type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{marginLeft:8,padding:'9px 10px',borderRadius:8,border:'1px solid var(--viz-border, #333)',background:'var(--viz-card, #151515)',color:'inherit',font:'inherit'}}/></label><span style={muted}>Updates from your Invoice Tracker and Expense Tracker in this browser.</span></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:11}}>{rows.map(({label,value,icon:Icon,detail},i)=><article key={label} style={{...card,borderColor:i===3?'var(--viz-accent, #6865f2)':'var(--viz-border, #333)'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><span style={muted}>{label}</span><Icon size={18}/></div><div style={{fontSize:25,fontWeight:800,margin:'10px 0 5px',overflowWrap:'anywhere'}}>{money(value)}</div><div style={muted}>{detail}</div></article>)}</div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:11}}><article style={card}><h2 style={{fontSize:18,margin:'0 0 8px'}}>Collection watch</h2><div style={{fontSize:24,fontWeight:800}}>{money(unpaid)}</div><p style={{...muted,marginBottom:0}}>Total invoices still marked Sent, Overdue or Partially paid across all months. Check invoice statuses regularly.</p></article><article style={card}><h2 style={{fontSize:18,margin:'0 0 8px'}}>Personal spending (separate)</h2><div style={{fontSize:24,fontWeight:800}}>{money(personalExpenses)}</div><p style={{...muted,marginBottom:0}}>Personal expenses for the selected month are shown separately and are not subtracted from estimated business net cash.</p></article></div>
  <div style={{...card,...muted}}><strong style={{color:'var(--viz-text, #f5f5f5)'}}>How to read this estimate</strong><ul style={{paddingLeft:19,marginBottom:0}}><li>Expected collections use unpaid invoice amounts with a due date in the selected month; partial payments are not split into paid and remaining amounts.</li><li>Paid invoices are grouped by issue date because this tracker does not record a separate payment date.</li><li>Only expenses marked Business and dated in the selected month are subtracted. Missing or late records will affect the estimate.</li><li>Refresh this page after changing records in another module. Data is stored locally in this browser and is not synced between devices.</li></ul></div>
 </section>;
}
