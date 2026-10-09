import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, Copy, Download, Trash2, CheckCircle2 } from 'lucide-react';

const KEY='agencyos:content-calendar:v1';
const field={width:'100%',boxSizing:'border-box',border:'1px solid var(--viz-border, #333)',borderRadius:9,padding:'10px 11px',background:'var(--viz-card, #151515)',color:'var(--viz-text, #f5f5f5)',font:'inherit'};
const card={border:'1px solid var(--viz-border, #333)',borderRadius:12,padding:16,background:'var(--viz-card, #151515)'};
const muted={color:'var(--viz-muted, #a1a1aa)',fontSize:13,lineHeight:1.6};
const channels=['Instagram','LinkedIn','Facebook','X','YouTube','Blog'];
const statuses=['Idea','Drafting','Ready','Published'];
function today(){return new Date().toISOString().slice(0,10)}
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(p=>p&&typeof p==='object').slice(0,500):[]}catch{return []}}
function id(){return globalThis.crypto?.randomUUID?.()||String(Date.now())}
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
export default function ContentCalendar(){
 const [posts,setPosts]=useState(load);const [title,setTitle]=useState('');const [date,setDate]=useState(today);const [channel,setChannel]=useState('Instagram');const [status,setStatus]=useState('Idea');const [caption,setCaption]=useState('');const [goal,setGoal]=useState('Educate');const [query,setQuery]=useState('');const [filter,setFilter]=useState('All');const [notice,setNotice]=useState('');
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(posts))}catch{setNotice('Browser storage is full; changes may not save.')}},[posts]);
 const visible=useMemo(()=>posts.filter(p=>(filter==='All'||p.status===filter)&&(p.title+' '+p.caption+' '+p.channel+' '+p.goal).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(a.date||'').localeCompare(b.date||'')),[posts,filter,query]);
 function add(e){e.preventDefault();if(!title.trim()){setNotice('Add a post title first.');return}setPosts(old=>[{id:id(),title:title.trim(),date,channel,status,caption:caption.trim(),goal,createdAt:new Date().toISOString()},...old]);setTitle('');setCaption('');setNotice('Post added to your calendar.')}
 function patch(postId,changes){setPosts(old=>old.map(p=>p.id===postId?{...p,...changes}:p))}
 function copy(text){navigator.clipboard?.writeText(text).then(()=>setNotice('Copied. Review before publishing.')).catch(()=>setNotice('Clipboard was blocked; use Export CSV instead.'))}
 function exportCsv(){const rows=[['Date','Channel','Status','Goal','Title','Caption'],...visible.map(p=>[p.date,p.channel,p.status,p.goal,p.title,p.caption])];const blob=new Blob(['\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='revoltz-content-calendar.csv';a.click();URL.revokeObjectURL(url);setNotice('Calendar exported as CSV.')}
 return <section style={{display:'grid',gap:16,color:'var(--viz-text, #f5f5f5)'}}>
  <div><h2 style={{margin:'0 0 6px',display:'flex',alignItems:'center',gap:9}}><CalendarDays size={22}/> Content Calendar</h2><p style={{...muted,margin:0}}>Plan social posts and content for your agency or clients. Drafts are saved in this browser; nothing is published automatically.</p></div>
  <form onSubmit={add} style={{...card,display:'grid',gap:12}}>
   <h3 style={{margin:0}}>Plan a post</h3>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
    <label style={{display:'grid',gap:6}}>Post title<input style={field} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. 3 website mistakes cafés make" maxLength={160}/></label>
    <label style={{display:'grid',gap:6}}>Publish date<input style={field} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label style={{display:'grid',gap:6}}>Channel<select style={field} value={channel} onChange={e=>setChannel(e.target.value)}>{channels.map(x=><option key={x}>{x}</option>)}</select></label>
    <label style={{display:'grid',gap:6}}>Status<select style={field} value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
    <label style={{display:'grid',gap:6}}>Content goal<select style={field} value={goal} onChange={e=>setGoal(e.target.value)}>{['Educate','Promote','Engage','Build trust','Generate leads','Behind the scenes'].map(x=><option key={x}>{x}</option>)}</select></label>
   </div>
   <label style={{display:'grid',gap:6}}>Caption / content draft<textarea style={{...field,minHeight:100,resize:'vertical'}} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Write a caption, outline, hook, or call to action…" maxLength={5000}/></label>
   <div><button className="button button-primary" type="submit"><Plus size={15}/> Add to calendar</button></div>
  </form>
  <div style={{...card,display:'grid',gap:12}}>
   <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}><h3 style={{margin:0}}>Your content plan ({visible.length})</h3><button className="button button-secondary" type="button" onClick={exportCsv}><Download size={15}/> Export CSV</button></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10}}><input style={field} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title, caption, channel…"/><select style={field} value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></div>
   {visible.length===0?<p style={muted}>No matching posts yet. Add your first idea above.</p>:visible.map(p=><article key={p.id} style={{...card,display:'grid',gap:10}}>
    <div style={{display:'flex',gap:10,justifyContent:'space-between',alignItems:'start',flexWrap:'wrap'}}><div><strong>{p.title}</strong><p style={{...muted,margin:'5px 0'}}>{p.date||'No date'} · {p.channel} · {p.goal}</p></div><span style={{...muted,border:'1px solid var(--viz-border, #333)',borderRadius:999,padding:'4px 9px'}}>{p.status}</span></div>
    {p.caption&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:0,lineHeight:1.6}}>{p.caption}</p>}
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><label style={{display:'flex',gap:7,alignItems:'center',fontSize:13}}>Update status<select style={{...field,width:'auto',padding:'7px 9px'}} value={p.status} onChange={e=>patch(p.id,{status:e.target.value})}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>{p.caption&&<button className="button button-secondary" type="button" onClick={()=>copy(p.caption)}><Copy size={14}/> Copy caption</button>}{p.status!=='Published'&&<button className="button button-secondary" type="button" onClick={()=>patch(p.id,{status:'Published'})}><CheckCircle2 size={14}/> Mark published</button>}<button className="button button-secondary" type="button" onClick={()=>{if(window.confirm('Delete this planned post?'))setPosts(old=>old.filter(x=>x.id!==p.id))}}><Trash2 size={14}/> Delete</button></div>
   </article>)}
  </div>
  {notice&&<p role="status" style={{...muted,margin:0}}>{notice}</p>}
 </section>;
}
