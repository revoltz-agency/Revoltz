import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, ClipboardCheck, FileText, Hammer, Home, IndianRupee, Layers3, Plus, Search, Users, Wallet, X } from 'lucide-react';

const STORAGE_KEY = 'agencyos:interior-design:v1';
const emptyData = { leads: [], projects: [], vendors: [], materials: [], tasks: [], payments: [] };
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const readData = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...emptyData, ...value } : emptyData;
  } catch { return emptyData; }
};
const styles = {
  page: { display: 'grid', gap: 22, maxWidth: 1240, color: 'var(--viz-text, #f5f5f5)' },
  muted: { color: 'var(--viz-muted, #a1a1aa)', fontSize: 13, lineHeight: 1.5 },
  panel: { border: '1px solid var(--viz-border, #333)', borderRadius: 16, background: 'var(--viz-card, #151515)', padding: 18, minWidth: 0 },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 11px', background: 'var(--viz-bg, #101010)', color: 'var(--viz-text, #f5f5f5)', font: 'inherit' },
  button: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid var(--viz-border, #444)', borderRadius: 9, padding: '9px 12px', color: 'var(--viz-text, #f5f5f5)', background: 'var(--viz-card, #181818)', font: 'inherit', cursor: 'pointer' },
};
const tabs = [
  ['Overview', Home], ['Leads & Clients', Users], ['Projects', Layers3], ['Design Approvals', ClipboardCheck],
  ['Materials', Hammer], ['Vendors', Users], ['Budget & Payments', Wallet], ['Tasks', CalendarDays], ['Reports', FileText],
];
const initialLead = { name: '', phone: '', propertyType: 'Residential', location: '', budget: '', source: 'Referral', status: 'New enquiry', nextFollowUp: '' };
const initialProject = { name: '', client: '', type: 'Residential', location: '', status: 'Planning', startDate: today(), dueDate: '', budget: '', spent: '', designStatus: 'Concept pending' };
const initialVendor = { name: '', category: 'Carpentry', phone: '', location: '', notes: '' };
const initialMaterial = { name: '', category: 'Furniture', vendor: '', quantity: '1', unit: 'pcs', unitCost: '', status: 'To source', project: '' };
const initialTask = { title: '', project: '', owner: '', dueDate: today(), priority: 'Normal', status: 'Open' };
const initialPayment = { project: '', description: 'Client instalment', type: 'Incoming', amount: '', date: today(), status: 'Pending' };
const initialApproval = { project: '', item: 'Concept design', status: 'Awaiting client', dueDate: today(), notes: '' };

export default function InteriorDesignStudio() {
  const [data, setData] = useState(readData);
  const [tab, setTab] = useState('Overview');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(null);

  function commit(next) {
    setData(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setNotice('Saved to this workspace.'); }
    catch { setNotice('Browser storage is full. Export your data before continuing.'); }
  }
  function startNew() {
    const config = formConfig[tab];
    if (!config) return;
    setEditing(null); setForm({ ...config.initial }); setFormOpen(true); setNotice('');
  }
  function startEdit(row) { setEditing(row.id); setForm({ ...row }); setFormOpen(true); setNotice(''); }
  function saveForm(event) {
    event.preventDefault();
    const config = formConfig[tab];
    if (!config || !String(form[config.required] || '').trim()) { setNotice(`Please enter ${config?.requiredLabel || 'the required field'}.`); return; }
    const rows = data[config.key] || [];
    const record = { ...form, id: editing || id(), updatedAt: new Date().toISOString() };
    commit({ ...data, [config.key]: editing ? rows.map((row) => row.id === editing ? record : row) : [record, ...rows] });
    setFormOpen(false); setEditing(null);
  }
  function removeRow(key, rowId) {
    if (!window.confirm('Delete this record? This cannot be undone from this screen.')) return;
    commit({ ...data, [key]: data[key].filter((row) => row.id !== rowId) });
  }
  function loadDemo() {
    if (!window.confirm('Add fictional sample records to this workspace? Existing records will be kept.')) return;
    const demo = {
      leads: [{ id: id(), name: 'Aarav Mehta', phone: '90000 12345', propertyType: '3 BHK apartment', location: 'Pune, Maharashtra', budget: '1800000', source: 'Referral', status: 'Consultation booked', nextFollowUp: today() }, { id: id(), name: 'Mira Shah', phone: '90000 67890', propertyType: 'Office', location: 'Pune, Maharashtra', budget: '3200000', source: 'Website', status: 'New enquiry', nextFollowUp: today() }],
      projects: [{ id: id(), name: 'Mehta Residence', client: 'Aarav Mehta', type: 'Residential', location: 'Baner, Pune', status: 'Design in progress', startDate: today(), dueDate: '', budget: '1800000', spent: '420000', designStatus: 'Concept approved' }, { id: id(), name: 'Studio Office Fit-out', client: 'Mira Shah', type: 'Commercial', location: 'Kalyani Nagar, Pune', status: 'Planning', startDate: today(), dueDate: '', budget: '3200000', spent: '0', designStatus: 'Concept pending' }],
      vendors: [{ id: id(), name: 'Oak & Grain Workshop', category: 'Carpentry', phone: '', location: 'Pune', notes: 'Fictional sample vendor' }],
      materials: [{ id: id(), name: 'Engineered oak finish', category: 'Surface finish', vendor: 'Oak & Grain Workshop', quantity: '25', unit: 'sq ft', unitCost: '450', status: 'Quotation requested', project: 'Mehta Residence' }],
      tasks: [{ id: id(), title: 'Confirm living room palette', project: 'Mehta Residence', owner: 'Lead designer', dueDate: today(), priority: 'High', status: 'Open' }],
      payments: [{ id: id(), project: 'Mehta Residence', description: 'Design advance', type: 'Incoming', amount: '150000', date: today(), status: 'Received' }],
      approvals: [{ id: id(), project: 'Mehta Residence', item: 'Living room concept', status: 'Approved', dueDate: today(), notes: 'Fictional sample approval' }],
    };
    const next = Object.fromEntries(Object.keys(emptyData).map((key) => [key, [...(data[key] || []), ...(demo[key] || [])]]));
    next.approvals = [...(data.approvals || []), ...demo.approvals];
    commit(next);
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'agencyos-interior-design-backup.json'; a.click(); URL.revokeObjectURL(url);
  }

  const projects = data.projects || [];
  const leads = data.leads || [];
  const tasks = data.tasks || [];
  const payments = data.payments || [];
  const totalBudget = projects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
  const totalSpent = projects.reduce((sum, p) => sum + (Number(p.spent) || 0), 0);
  const pendingPayments = payments.filter((p) => p.status === 'Pending').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < today() && t.status !== 'Completed').length;
  const activeProjects = projects.filter((p) => !['Completed', 'Handed over', 'Cancelled'].includes(p.status)).length;
  const allRows = { 'Leads & Clients': leads, Projects: projects, 'Design Approvals': data.approvals || [], Materials: data.materials || [], Vendors: data.vendors || [], 'Budget & Payments': payments, Tasks: tasks };
  const visibleRows = (allRows[tab] || []).filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  const formConfig = {
    'Leads & Clients': { key: 'leads', initial: initialLead, required: 'name', requiredLabel: 'client name', fields: [['name','Client name','text'],['phone','Phone','tel'],['propertyType','Property / project type','select',['Residential','Commercial','Office','Retail','Hospitality','Other']],['location','Location','text'],['budget','Indicative budget (₹)','number'],['source','Lead source','select',['Referral','Website','Instagram','Walk-in','Partner','Other']],['status','Lead status','select',['New enquiry','Contacted','Consultation booked','Proposal sent','Won','Lost']],['nextFollowUp','Next follow-up','date']] },
    Projects: { key: 'projects', initial: initialProject, required: 'name', requiredLabel: 'project name', fields: [['name','Project name','text'],['client','Client','text'],['type','Project type','select',['Residential','Commercial','Office','Retail','Hospitality','Other']],['location','Site location','text'],['status','Project status','select',['Planning','Design in progress','Awaiting approval','Procurement','Execution','Snagging','Completed','Handed over','On hold','Cancelled']],['startDate','Start date','date'],['dueDate','Target handover','date'],['budget','Approved budget (₹)','number'],['spent','Actual cost to date (₹)','number'],['designStatus','Design approval status','select',['Concept pending','Concept submitted','Revision requested','Concept approved','Working drawings','Approved for execution']]] },
    'Design Approvals': { key: 'approvals', initial: initialApproval, required: 'item', requiredLabel: 'approval item', fields: [['project','Project','text'],['item','Design item / revision','text'],['status','Approval status','select',['Draft','Submitted','Awaiting client','Revision requested','Approved','Rejected']],['dueDate','Decision due date','date'],['notes','Notes / file link','text']] },
    Materials: { key: 'materials', initial: initialMaterial, required: 'name', requiredLabel: 'material name', fields: [['name','Material / product','text'],['category','Category','select',['Furniture','Lighting','Tiles','Paint','Fabric','Surface finish','Fixtures','Hardware','Other']],['vendor','Vendor','text'],['quantity','Quantity','number'],['unit','Unit','text'],['unitCost','Unit cost (₹)','number'],['status','Procurement status','select',['To source','Quotation requested','Quoted','Approved','Ordered','Partially delivered','Delivered','Installed']],['project','Project','text']] },
    Vendors: { key: 'vendors', initial: initialVendor, required: 'name', requiredLabel: 'vendor name', fields: [['name','Vendor / contractor','text'],['category','Trade / category','select',['Carpentry','Electrical','Plumbing','Civil','Painting','Furniture','Lighting','Stone / tile','HVAC','Other']],['phone','Phone','tel'],['location','Location','text'],['notes','Notes','text']] },
    Tasks: { key: 'tasks', initial: initialTask, required: 'title', requiredLabel: 'task title', fields: [['title','Task','text'],['project','Project','text'],['owner','Assigned to','text'],['dueDate','Due date','date'],['priority','Priority','select',['Low','Normal','High','Urgent']],['status','Status','select',['Open','In progress','Waiting','Completed','Cancelled']] ] },
    'Budget & Payments': { key: 'payments', initial: initialPayment, required: 'description', requiredLabel: 'payment description', fields: [['project','Project','text'],['description','Payment / expense description','text'],['type','Direction','select',['Incoming','Outgoing']],['amount','Amount (₹)','number'],['date','Date','date'],['status','Status','select',['Pending','Received','Paid','Overdue','Cancelled']] ] },
  };
  const stats = [
    { label: 'Active projects', value: activeProjects, icon: Layers3, hint: `${projects.length} total projects` },
    { label: 'Open enquiries', value: leads.filter((l) => !['Won','Lost'].includes(l.status)).length, icon: Users, hint: `${leads.length} total leads` },
    { label: 'Budget tracked', value: money(totalBudget), icon: IndianRupee, hint: `Spent ${money(totalSpent)}` },
    { label: 'Pending payments', value: money(pendingPayments), icon: Wallet, hint: overdueTasks ? `${overdueTasks} overdue tasks` : 'No overdue tasks' },
  ];

  return <div style={styles.page}>
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
        <div style={{ padding: 12, border: '1px solid var(--viz-border, #333)', borderRadius: 13 }}><Layers3 size={24}/></div>
        <div><div style={{ ...styles.muted, letterSpacing: '.15em', fontWeight: 700 }}>AGENCYOS · INTERIOR DESIGN EDITION</div><h1 style={{ fontSize: 32, margin: '4px 0 7px' }}>Studio operations</h1><p style={{ ...styles.muted, margin: 0, maxWidth: 700 }}>From first enquiry to design approval, site execution and handover. Keep clients, costs and delivery moving in one workspace.</p></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" style={styles.button} onClick={exportData}><FileText size={15}/> Export backup</button><button type="button" style={styles.button} onClick={loadDemo}><Plus size={15}/> Load sample data</button></div>
    </header>
    <nav aria-label="Interior design modules" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4 }}>
      {tabs.map(([label, Icon]) => <button key={label} type="button" onClick={() => { setTab(label); setSearch(''); setFormOpen(false); }} style={{ ...styles.button, flexShrink: 0, borderColor: tab === label ? 'var(--viz-accent, #65d6a4)' : 'var(--viz-border, #333)', background: tab === label ? 'var(--viz-accent-soft, #14231d)' : 'var(--viz-card, #151515)' }}><Icon size={15}/>{label}</button>)}
    </nav>
    {notice && <div role="status" style={{ ...styles.muted, border: '1px solid var(--viz-border, #333)', padding: '9px 12px', borderRadius: 9 }}>{notice}</div>}
    {tab === 'Overview' && <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>{stats.map(({label,value,icon:Icon,hint}) => <div key={label} style={styles.panel}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}><span style={styles.muted}>{label}</span><Icon size={17}/></div><strong style={{ display:'block', fontSize:25, margin:'13px 0 5px', overflowWrap:'anywhere' }}>{value}</strong><span style={styles.muted}>{hint}</span></div>)}</section>
      <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
        <div style={styles.panel}><h2 style={{ fontSize:17, margin:'0 0 13px' }}>Project pulse</h2>{projects.slice(0,5).map((p) => <div key={p.id} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'12px 0', borderTop:'1px solid var(--viz-border, #333)' }}><div><strong>{p.name}</strong><div style={styles.muted}>{p.client || 'Client not set'} · {p.status}</div></div><div style={{ textAlign:'right' }}><strong>{money(p.budget)}</strong><div style={styles.muted}>{p.budget ? Math.min(100, Math.round((Number(p.spent||0)/Math.max(1,Number(p.budget))) * 100)) : 0}% budget used</div></div></div>)}{!projects.length && <p style={styles.muted}>No projects yet. Add your first project or load fictional sample data.</p>}<button type="button" style={styles.button} onClick={() => {setTab('Projects');setForm({...initialProject});setFormOpen(true)}}><Plus size={14}/> Add project</button></div>
        <div style={styles.panel}><h2 style={{ fontSize:17, margin:'0 0 13px' }}>Next actions</h2>{tasks.filter((t) => t.status !== 'Completed').slice(0,5).map((t) => <div key={t.id} style={{ padding:'11px 0', borderTop:'1px solid var(--viz-border, #333)' }}><strong>{t.title}</strong><div style={styles.muted}>{t.project || 'No project'} · Due {t.dueDate || 'not scheduled'} · {t.priority}</div></div>)}{!tasks.filter((t) => t.status !== 'Completed').length && <p style={styles.muted}>Your open tasks will appear here.</p>}<button type="button" style={styles.button} onClick={() => {setTab('Tasks');setForm({...initialTask});setFormOpen(true)}}><Plus size={14}/> Add task</button></div>
      </section>
      <section style={styles.panel}><h2 style={{ fontSize:17, margin:'0 0 8px' }}>Workflow at a glance</h2><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:9 }}>{['Enquiry','Consultation','Proposal','Design','Approval','Procurement','Execution','Handover'].map((step,i)=><div key={step} style={{ padding:12, borderRadius:10, border:'1px solid var(--viz-border, #333)' }}><span style={{ ...styles.muted, fontSize:11 }}>STEP {String(i+1).padStart(2,'0')}</span><strong style={{ display:'block', marginTop:5 }}>{step}</strong></div>)}</div></section>
    </>}
    {tab === 'Reports' && <section style={styles.panel}><h2 style={{ marginTop:0 }}>Studio performance</h2><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>{[['Total projects',projects.length],['Completed projects',projects.filter(p=>['Completed','Handed over'].includes(p.status)).length],['Total approved budget',money(totalBudget)],['Actual costs recorded',money(totalSpent)],['Cost variance',money(totalBudget-totalSpent)],['Overdue tasks',overdueTasks]].map(([label,value])=><div key={label} style={{ padding:14, border:'1px solid var(--viz-border, #333)', borderRadius:10 }}><span style={styles.muted}>{label}</span><strong style={{ display:'block', fontSize:22, marginTop:8 }}>{value}</strong></div>)}</div><p style={styles.muted}>Reports use only records entered here; they are operational summaries, not audited accounts or tax reports.</p></section>}
    {allRows[tab] && <>
      <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', gap:10, alignItems:'center' }}><div><h2 style={{ margin:'0 0 4px', fontSize:22 }}>{tab}</h2><p style={{ ...styles.muted, margin:0 }}>{visibleRows.length} records · search, edit or remove records below.</p></div><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><label style={{ position:'relative' }}><Search size={15} style={{ position:'absolute', left:10, top:12, color:'var(--viz-muted, #a1a1aa)' }}/><input aria-label="Search records" style={{ ...styles.input, width:220, paddingLeft:32 }} value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search records"/></label><button type="button" style={styles.button} onClick={startNew}><Plus size={15}/> Add {tab === 'Leads & Clients' ? 'client' : tab === 'Budget & Payments' ? 'entry' : tab === 'Design Approvals' ? 'approval' : tab === 'Materials' ? 'material' : tab === 'Vendors' ? 'vendor' : tab === 'Tasks' ? 'task' : 'project'}</button></div></div>
      {formOpen && <form onSubmit={saveForm} style={{ ...styles.panel, display:'grid', gap:13 }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><h3 style={{ margin:0 }}>{editing ? 'Edit record' : 'New record'}</h3><button type="button" aria-label="Close form" style={styles.button} onClick={()=>setFormOpen(false)}><X size={15}/></button></div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>{formConfig[tab]?.fields.map(([key,label,type,options])=><label key={key} style={{ display:'grid', gap:6, fontSize:13, color:'var(--viz-muted, #a1a1aa)' }}>{label}{type==='select'?<select style={styles.input} value={form[key] ?? ''} onChange={e=>setForm({...form,[key]:e.target.value})}>{options.map(option=><option key={option}>{option}</option>)}</select>:<input style={styles.input} type={type} min={type==='number'?'0':undefined} step={type==='number'?'0.01':undefined} value={form[key] ?? ''} onChange={e=>setForm({...form,[key]:e.target.value})} maxLength={key==='notes'?1500:180}/>}</label>)}</div><div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}><button type="button" style={styles.button} onClick={()=>setFormOpen(false)}>Cancel</button><button type="submit" style={{ ...styles.button, borderColor:'var(--viz-accent, #65d6a4)' }}><CheckCircle2 size={15}/> Save record</button></div></form>}
      <section style={{ display:'grid', gap:10 }}>{visibleRows.map((row)=>{const title=row.name||row.title||row.item||row.description||'Record';const sub=[row.client,row.project,row.location,row.category].filter(Boolean).join(' · ');return <article key={row.id} style={{ ...styles.panel, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:15, flexWrap:'wrap' }}><div style={{ minWidth:180, flex:'1 1 240px' }}><strong style={{ fontSize:16 }}>{title}</strong><div style={{ ...styles.muted, marginTop:4 }}>{sub || row.phone || 'Details not added'}</div><div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:10 }}>{Object.entries(row).filter(([key,value])=>!['id','updatedAt','name','title','item','description','client','project','location','category','phone','notes'].includes(key)&&value!==''&&value!=null).slice(0,5).map(([key,value])=><span key={key} style={{ border:'1px solid var(--viz-border, #333)', borderRadius:7, padding:'4px 7px', fontSize:11, color:'var(--viz-muted, #a1a1aa)' }}>{key.replace(/([A-Z])/g,' $1')}: {key.toLowerCase().includes('budget')||key.toLowerCase().includes('spent')||key.toLowerCase().includes('amount')||key.toLowerCase().includes('cost')?money(value):String(value)}</span>)}</div>{row.notes&&<p style={styles.muted}>{row.notes}</p>}</div><div style={{ display:'flex', gap:7 }}><button type="button" style={styles.button} onClick={()=>startEdit(row)}>Edit</button><button type="button" style={styles.button} aria-label={`Delete ${title}`} onClick={()=>removeRow(formConfig[tab]?.key||'approvals',row.id)}><X size={14}/></button></div></article>})}{!visibleRows.length && <div style={{ ...styles.panel, textAlign:'center', padding:35 }}><Layers3 size={24}/><h3>No records yet</h3><p style={styles.muted}>Add your first {tab.toLowerCase()} record. You can also load fictional samples to explore the workflow.</p><button type="button" style={styles.button} onClick={startNew}><Plus size={15}/> Add first record</button></div>}</section>
    </>}
    <footer style={styles.muted}>Phase 1 workspace. Records are saved in this browser workspace and may sync through AgencyOS workspace sync when enabled. Export a backup regularly. Sample data is fictional; no messages are sent automatically.</footer>
  </div>;
}
