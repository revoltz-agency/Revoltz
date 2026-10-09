import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Save, Trash2, Download, StickyNote } from 'lucide-react';

const KEY='agencyos:quick-notes:v1';
const muted={color:'var(--viz-muted, #a1a1aa)',fontSize:13,lineHeight:1.6};
const field={width:'100%',boxSizing:'border-box',border:'1px solid var(--viz-border, #333)',borderRadius:9,padding:'10px 11px',background:'var(--viz-card, #151515)',color:'var(--viz-text, #f5f5f5)',font:'inherit'};
const card={border:'1px solid var(--viz-border, #333)',borderRadius:12,padding:16,background:'var(--viz-card, #151515)'};
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function stamp(){return new Date().toISOString()}
export default function QuickNotes(){
 const [notes,setNotes]=useState(read);
 const [title,setTitle]=useState('');
 const [body,setBody]=useState('');
 const [category,setCategory]=useState('General');
 const [query,setQuery]=useState('');
 const [notice,setNotice]=useState('');
 const [editing,setEditing]=useState(null);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(notes))}catch{setNotice('Browser storage is full; changes may not save.')}},[notes]);
 const visible=useMemo(()=>notes.filter(n=>(n.title+' '+n.body+' '+n.category).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),[notes,query]);
 function reset(){setTitle('');setBody('');setCategory('General');setEditing(null)}
 function save(e){e.preventDefault();if(!title.trim()&&!body.trim()){setNotice('Add a title or some note text first.');return}const now=stamp();if(editing){setNotes(old=>old.map(n=>n.id===editing?{...n,title:title.trim()||'Untitled note',body:body.trim(),category,updatedAt:now}:n))}else{setNotes(old=>[{id:globalThis.crypto?.randomUUID?.()||String(Date.now()),title:title.trim()||'Untitled note',body:body.trim(),category,createdAt:now,updatedAt:now},...old])}reset();setNotice('Note saved on this browser.')}
 function edit(n){setEditing(n.id);setTitle(n.title);setBody(n.body);setCategory(n.category);window.scrollTo({top:0,behavior:'smooth'})}
 function exportNotes(){const blob=new Blob([JSON.stringify({app:'REVOLTZ AgencyOS Quick Notes',exportedAt:stamp(),notes},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='agencyos-notes.json';a.click();URL.revokeObjectURL(url)}
 return <section style={{display:'grid',gap:16,color:'var(--viz-text, #f5f5f5)'}}>
  <div><h2 style={{margin:'0 0 6px',display:'flex',alignItems:'center',gap:9}}><StickyNote size={22}/> Quick Notes</h2><p style={{...muted,margin:0}}>Capture client call notes, business ideas, reminders and work-in-progress thoughts.</p></div>
  <form onSubmit={save} style={{...card,display:'grid',gap:12}}>
   <h3 style={{margin:0}}>{editing?'Edit note':'Create a note'}</h3>
   <label style={{display:'grid',gap:6}}>Title<input style={field} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Follow up with café owner"/></label>
   <label style={{display:'grid',gap:6}}>Category<select style={field} value={category} onChange={e=>setCategory(e.target.value)}>{['General','Client','Sales','Idea','Task','Finance'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label style={{display:'grid',gap:6}}>Note<textarea style={{...field,minHeight:120,resize:'vertical'}} value={body} onChange={e=>setBody(e.target.value)} placeholder="Write details, next steps, budget, or call summary..."/></label>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="submit" style={{...field,width:'auto',cursor:'pointer',display:'inline-flex',gap:8,alignItems:'center'}}><Save size={16}/>{editing?'Update note':'Save note'}</button>{editing&&<button type="button" style={{...field,width:'auto',cursor:'pointer'}} onClick={reset}>Cancel edit</button>}</div>
  </form>
  <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}><label style={{display:'flex',gap:8,alignItems:'center',flex:1,minWidth:220}}><Search size={17}/><input style={field} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your notes..."/></label><button style={{...field,width:'auto',cursor:'pointer',display:'inline-flex',gap:8,alignItems:'center'}} onClick={exportNotes}><Download size={16}/> Export notes</button><span style={muted}>{notes.length} saved</span></div>
  {!visible.length?<div style={{...card,textAlign:'center',padding:26}}><StickyNote size={28}/><p style={muted}>{query?'No notes match your search.':'No notes yet. Create your first note above.'}</p></div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:12}}>{visible.map(n=><article key={n.id} style={{...card,display:'grid',gap:10,alignContent:'start'}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start'}}><div><strong style={{fontSize:16,overflowWrap:'anywhere'}}>{n.title}</strong><p style={{...muted,margin:'5px 0 0'}}>{n.category} · Updated {new Date(n.updatedAt).toLocaleString()}</p></div><button aria-label="Delete note" title="Delete note" style={{...field,width:'auto',padding:8,cursor:'pointer'}} onClick={()=>{if(confirm('Delete this note permanently?'))setNotes(old=>old.filter(x=>x.id!==n.id))}}><Trash2 size={16}/></button></div><p style={{margin:0,whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.6}}>{n.body||'No details added.'}</p><button style={{...field,width:'auto',justifySelf:'start',cursor:'pointer'}} onClick={()=>edit(n)}>Edit note</button></article>)}</div>}
  {notice&&<p role="status" style={muted}>{notice}</p>}
 </section>;
}
