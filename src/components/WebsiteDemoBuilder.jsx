import { useEffect, useState } from 'react';
import { Download, Eye, Monitor, Smartphone, Sparkles, RotateCcw } from 'lucide-react';

const KEY = 'agencyos:website-demo-builder:v1';
const initial = { businessName:'Your Business', industry:'Local business', tagline:'Quality service. A better experience.', location:'Pune, India', phone:'', email:'', services:'Personalized service\nReliable quality\nEasy booking', cta:'Contact us', accent:'#7c3aed' };
const box = { border:'1px solid var(--viz-border, #333)', borderRadius:12, padding:16, background:'var(--viz-card, #151515)' };
const field = { width:'100%', boxSizing:'border-box', border:'1px solid var(--viz-border, #3f3f46)', borderRadius:9, padding:'10px 11px', background:'var(--viz-card, #151515)', color:'var(--viz-text, #f5f5f5)', font:'inherit' };
const label = { display:'grid', gap:6, fontSize:13, fontWeight:600 };
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

export default function WebsiteDemoBuilder() {
  const [form, setForm] = useState(() => {
    try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return initial; }
  });
  const [view, setView] = useState('desktop');
  const [notice, setNotice] = useState('');
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(form)); } catch {} }, [form]);
  function update(key, value) { setForm(old => ({ ...old, [key]: value })); setNotice(''); }
  const services = form.services.split('\n').map(s => s.trim()).filter(Boolean).slice(0,6);
  function buildHtml() {
    const accent = /^#[0-9a-f]{6}$/i.test(form.accent) ? form.accent : '#7c3aed';
    const cards = (services.length ? services : ['Your service']).map(s => '<article class="service"><span>✦</span><h3>'+escapeHtml(s)+'</h3><p>Thoughtfully delivered to help you get the result you need.</p></article>').join('');
    const contact = [form.phone ? '<p>Phone: '+escapeHtml(form.phone)+'</p>' : '', form.email ? '<p>Email: '+escapeHtml(form.email)+'</p>' : '', form.location ? '<p>'+escapeHtml(form.location)+'</p>' : ''].join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(form.businessName)+'</title><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#18181b;background:#fafafa;line-height:1.6}.nav{padding:22px 7%;display:flex;justify-content:space-between;align-items:center;background:white}.brand{font-weight:800;font-size:20px}.hero{padding:90px 8%;background:linear-gradient(135deg,#18181b,#333);color:white;text-align:center}.eyebrow{color:'+accent+';font-weight:800;text-transform:uppercase;letter-spacing:2px}.hero h1{font-size:clamp(36px,6vw,64px);line-height:1.05;margin:16px auto;max-width:850px}.hero p{font-size:18px;color:#d4d4d8;max-width:650px;margin:0 auto 26px}.btn{display:inline-block;background:'+accent+';color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700}.wrap{max-width:1100px;margin:auto;padding:60px 24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.service{background:white;padding:24px;border:1px solid #e4e4e7;border-radius:14px}.service span{color:'+accent+';font-size:24px}.service p{color:#71717a}footer{background:#18181b;color:white;padding:35px 8%;text-align:center}footer p{margin:5px;color:#d4d4d8}.preview-note{font-size:12px;color:#a1a1aa;margin-top:20px}@media(max-width:600px){.hero{padding:60px 22px}.nav{padding:16px 20px}.wrap{padding:40px 18px}}</style></head><body><nav class="nav"><div class="brand">'+escapeHtml(form.businessName)+'</div><a class="btn" href="#contact">'+escapeHtml(form.cta || 'Contact us')+'</a></nav><header class="hero"><div class="eyebrow">'+escapeHtml(form.industry)+'</div><h1>'+escapeHtml(form.tagline)+'</h1><p>'+escapeHtml(form.businessName)+' helps customers with dependable service and a straightforward experience.</p><a class="btn" href="#contact">'+escapeHtml(form.cta || 'Contact us')+'</a></header><main class="wrap"><h2 style="font-size:32px">What we offer</h2><p style="color:#71717a">Services designed around your needs.</p><div class="grid">'+cards+'</div></main><footer id="contact"><h2>Let’s talk</h2>'+contact+'<p>Demo concept — replace sample copy with verified business details before publishing.</p></footer></body></html>';
  }
  function download() {
    const blob = new Blob([buildHtml()], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = (form.businessName || 'website-demo').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-demo.html';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setNotice('Standalone HTML demo downloaded. Open it in your browser to review or share the file.');
  }
  function reset() { setForm(initial); setNotice('Draft reset.'); }
  return <section style={{display:'grid',gap:18,color:'var(--viz-text, #f5f5f5)'}}>
    <header><div style={{display:'flex',alignItems:'center',gap:10,color:'var(--viz-muted, #a1a1aa)',fontSize:11,fontWeight:800,letterSpacing:'.14em'}}><Sparkles size={15}/> REVOLTZ AI · SALES TOOL</div><h1 style={{fontSize:32,margin:'8px 0'}}>Website Demo Builder</h1><p style={{margin:0,color:'var(--viz-muted, #a1a1aa)',lineHeight:1.6,maxWidth:760}}>Build a quick, editable website concept for a prospect, preview it live, and export a standalone HTML file. Your draft saves in this browser. This tool does not publish a website or create a hosted preview link.</p></header>
    <div style={{display:'grid',gridTemplateColumns:'minmax(280px,360px) minmax(0,1fr)',gap:16,alignItems:'start'}}>
      <form onSubmit={e=>{e.preventDefault();download();}} style={{...box,display:'grid',gap:13}}>
        <h2 style={{fontSize:18,margin:0}}>Demo details</h2>
        <label style={label}>Business name<input style={field} maxLength={100} value={form.businessName} onChange={e=>update('businessName',e.target.value)}/></label>
        <label style={label}>Industry<input style={field} maxLength={80} value={form.industry} onChange={e=>update('industry',e.target.value)}/></label>
        <label style={label}>Headline / tagline<textarea style={field} rows={2} maxLength={180} value={form.tagline} onChange={e=>update('tagline',e.target.value)}/></label>
        <label style={label}>Location<input style={field} maxLength={120} value={form.location} onChange={e=>update('location',e.target.value)}/></label>
        <label style={label}>Services (one per line, up to 6)<textarea style={field} rows={5} maxLength={700} value={form.services} onChange={e=>update('services',e.target.value)}/></label>
        <label style={label}>Call-to-action label<input style={field} maxLength={40} value={form.cta} onChange={e=>update('cta',e.target.value)}/></label>
        <label style={label}>Business phone (optional)<input style={field} maxLength={50} value={form.phone} onChange={e=>update('phone',e.target.value)}/></label>
        <label style={label}>Business email (optional)<input style={field} type="email" maxLength={120} value={form.email} onChange={e=>update('email',e.target.value)}/></label>
        <label style={label}>Accent color<div style={{display:'flex',alignItems:'center',gap:10}}><input aria-label="Accent color" type="color" value={form.accent} onChange={e=>update('accent',e.target.value)} style={{width:48,height:38,border:0,background:'transparent'}}/><code>{form.accent}</code></div></label>
        <button type="submit" style={{...field,cursor:'pointer',background:form.accent,borderColor:form.accent,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><Download size={16}/> Export HTML demo</button>
        <button type="button" onClick={reset} style={{...field,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><RotateCcw size={15}/> Reset draft</button>
      </form>
      <div style={{...box,minWidth:0,display:'grid',gap:12}}>
        <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}><div style={{display:'flex',alignItems:'center',gap:8}}><Eye size={17}/><strong>Live preview</strong></div><div style={{display:'flex',gap:6}}><button type="button" onClick={()=>setView('desktop')} style={{...field,width:'auto',cursor:'pointer',background:view==='desktop'?'var(--viz-border, #333)':'transparent',display:'flex',gap:6,alignItems:'center'}}><Monitor size={14}/> Desktop</button><button type="button" onClick={()=>setView('mobile')} style={{...field,width:'auto',cursor:'pointer',background:view==='mobile'?'var(--viz-border, #333)':'transparent',display:'flex',gap:6,alignItems:'center'}}><Smartphone size={14}/> Mobile</button></div></div>
        <div style={{background:'#e4e4e7',borderRadius:12,padding:12,overflow:'auto'}}><div style={{width:view==='mobile'?375:'100%',maxWidth:'100%',margin:'0 auto',background:'#fafafa',borderRadius:8,overflow:'hidden',color:'#18181b',fontFamily:'Arial,sans-serif',boxShadow:'0 4px 20px #0002'}}>
          <div style={{padding:'15px 5%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,background:'#fff',fontSize:13,fontWeight:800}}><span style={{overflowWrap:'anywhere'}}>{form.businessName || 'Your Business'}</span><span style={{background:form.accent,color:'#fff',padding:'7px 10px',borderRadius:6,whiteSpace:'nowrap',fontSize:11}}>{form.cta || 'Contact us'}</span></div>
          <div style={{padding:view==='mobile'?'48px 20px':'64px 7%',textAlign:'center',background:'linear-gradient(135deg,#18181b,#3f3f46)',color:'#fff'}}><div style={{fontSize:11,letterSpacing:2,fontWeight:800,color:form.accent,textTransform:'uppercase'}}>{form.industry || 'Local business'}</div><h2 style={{fontSize:view==='mobile'?31:42,lineHeight:1.12,margin:'16px 0',overflowWrap:'anywhere'}}>{form.tagline || 'Quality service. A better experience.'}</h2><p style={{color:'#d4d4d8',fontSize:14,lineHeight:1.7}}>{form.businessName || 'Your Business'} helps customers with dependable service and a straightforward experience.</p><span style={{display:'inline-block',background:form.accent,color:'#fff',padding:'10px 17px',borderRadius:7,fontWeight:700,fontSize:13}}>{form.cta || 'Contact us'}</span></div>
          <div style={{padding:view==='mobile'?'30px 16px':'40px 5%'}}><h3 style={{fontSize:24,margin:'0 0 8px'}}>What we offer</h3><p style={{color:'#71717a',fontSize:13,marginTop:0}}>Services designed around your needs.</p><div style={{display:'grid',gridTemplateColumns:view==='mobile'?'1fr':'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>{(services.length?services:['Your service']).map((s,i)=><div key={i} style={{background:'#fff',border:'1px solid #e4e4e7',borderRadius:10,padding:16}}><div style={{color:form.accent,fontSize:20}}>✦</div><strong style={{fontSize:14,overflowWrap:'anywhere'}}>{s}</strong><p style={{color:'#71717a',fontSize:12,lineHeight:1.6}}>Thoughtfully delivered to help you get the result you need.</p></div>)}</div></div>
          <div style={{background:'#18181b',color:'#fff',padding:24,textAlign:'center'}}><h3 style={{margin:'0 0 8px'}}>Let’s talk</h3>{form.phone&&<p style={{fontSize:12,color:'#d4d4d8'}}>Phone: {form.phone}</p>}{form.email&&<p style={{fontSize:12,color:'#d4d4d8',overflowWrap:'anywhere'}}>Email: {form.email}</p>}{form.location&&<p style={{fontSize:12,color:'#d4d4d8'}}>{form.location}</p>}<p style={{fontSize:10,color:'#a1a1aa'}}>Demo concept — verify details before publishing.</p></div>
        </div></div>
        {notice&&<p role="status" style={{margin:0,color:'var(--viz-muted, #a1a1aa)',lineHeight:1.5}}>{notice}</p>}
      </div>
    </div>
    <p style={{fontSize:12,color:'var(--viz-muted, #a1a1aa)',lineHeight:1.6,margin:0}}>Use only business details you are authorized to share. The exported file is a concept, not a production-ready or hosted website. Review the copy and links before sending it to a prospect.</p>
    <style>{'@media(max-width:850px){.website-demo-layout{grid-template-columns:1fr!important}}'}</style>
  </section>;
}
