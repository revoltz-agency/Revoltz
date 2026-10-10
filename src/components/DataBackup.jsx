import { useRef, useState } from 'react';
import { Download, Upload, ShieldCheck, AlertTriangle } from 'lucide-react';

const BACKUP_KEYS = [
  'agencyos:workflow:v1',
  'agencyos:saved-place-ids:v1',
  'agencyos:search-history:v1',
  'agencyos:manual-leads:v1',
  'agencyos:manual-lead-overrides:v1',
  'agencyos:sales-packages:v1',
  'agencyos:deal-tracker:v1',
  'agencyos:follow-up-assistant:v1',
  'agencyos:client-onboarding:v1',
  'agencyos:client-retention:v1',
  'agencyos:invoice-tracker:v1',
  'agencyos:project-tracker:v1',
  'agencyos:quick-notes:v1',
  'agencyos:revenue-goals:v1',
  'agencyos:expense-tracker:v1',
  'agencyos:client-activity-log:v1',
];
const style = { border:'1px solid var(--viz-border, #333)', borderRadius:12, padding:18, background:'var(--viz-card, #151515)' };
const button = { display:'inline-flex', alignItems:'center', gap:8, border:'1px solid var(--viz-border, #444)', borderRadius:9, padding:'10px 13px', background:'var(--viz-card, #151515)', color:'var(--viz-text, #f5f5f5)', cursor:'pointer', font:'inherit' };

export default function DataBackup() {
  const fileRef = useRef(null);
  const [notice, setNotice] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null);
  function exportBackup() {
    const data = {};
    let count = 0;
    BACKUP_KEYS.forEach(key => { const value = localStorage.getItem(key); if (value !== null) { data[key] = value; count++; } });
    const backup = { app:'REVOLTZ AgencyOS', formatVersion:1, exportedAt:new Date().toISOString(), records: data };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'agencyos-backup-' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(url);
    setNotice('Backup downloaded. ' + count + ' saved data categories included.');
  }
  function chooseFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setNotice('Backup file is too large (maximum 10 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (parsed?.app !== 'REVOLTZ AgencyOS' || parsed?.formatVersion !== 1 || !parsed.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) throw new Error('This is not a supported AgencyOS backup.');
        const entries = Object.entries(parsed.records);
        if (!entries.length || entries.some(([key, value]) => !BACKUP_KEYS.includes(key) || typeof value !== 'string')) throw new Error('Backup contains unsupported or invalid data.');
        for (const [, value] of entries) JSON.parse(value);
        setConfirmRestore({ records:parsed.records, count:entries.length, exportedAt:parsed.exportedAt || 'unknown date' });
        setNotice('');
      } catch (error) { setNotice(error.message || 'Could not read this backup file.'); }
    };
    reader.onerror = () => setNotice('Could not read the selected file.');
    reader.readAsText(file);
  }
  function restore() {
    if (!confirmRestore) return;
    try {
      confirmRestore.records && Object.entries(confirmRestore.records).forEach(([key,value]) => localStorage.setItem(key, value));
      setNotice('Restore complete. Refresh AgencyOS to reload restored records.'); setConfirmRestore(null);
    } catch { setNotice('Restore failed, likely because browser storage is full. Your browser may have restored only some categories.'); }
  }
  return <section style={{ display:'grid', gap:16, color:'var(--viz-text, #f5f5f5)' }}>
    <div><h2 style={{margin:'0 0 6px'}}>Data Backup & Restore</h2><p style={{margin:0,color:'var(--viz-muted, #a1a1aa)',lineHeight:1.6}}>Download a portable backup of this browser’s AgencyOS records, or restore them from a previous backup.</p></div>
    <div style={{...style,display:'flex',gap:12,alignItems:'flex-start'}}><ShieldCheck size={24}/><div><strong>Your data stays in your browser</strong><p style={{margin:'6px 0 0',color:'var(--viz-muted, #a1a1aa)',lineHeight:1.6}}>Backups include saved leads, sales packages, deals, onboarding, client retention, invoices, projects, notes, revenue goals and expenses where those records use the supported AgencyOS storage keys. The backup file may contain client details; keep it private.</p></div></div>
    <div style={{...style,display:'grid',gap:12}}><h3 style={{margin:0}}>Create a backup</h3><p style={{margin:0,color:'var(--viz-muted, #a1a1aa)'}}>Download a JSON file you can keep somewhere safe or use to move data to another browser.</p><div><button style={button} onClick={exportBackup}><Download size={17}/> Download backup</button></div></div>
    <div style={{...style,display:'grid',gap:12}}><h3 style={{margin:0}}>Restore a backup</h3><p style={{margin:0,color:'var(--viz-muted, #a1a1aa)'}}>Choose a JSON backup created by AgencyOS. You will be asked to confirm before saved categories are replaced.</p><div><input ref={fileRef} type="file" accept=".json,application/json" onChange={chooseFile} style={{display:'none'}}/><button style={button} onClick={()=>fileRef.current?.click()}><Upload size={17}/> Choose backup file</button></div>
    {confirmRestore && <div style={{border:'1px solid #b7791f',borderRadius:10,padding:14,display:'grid',gap:10}}><strong style={{display:'flex',gap:8,alignItems:'center'}}><AlertTriangle size={18}/> Confirm restore</strong><p style={{margin:0,lineHeight:1.5}}>This file contains {confirmRestore.count} data categories (exported {confirmRestore.exportedAt}). Values for those categories on this browser will be overwritten. Categories missing from the backup will be left unchanged.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={button} onClick={restore}>Confirm restore</button><button style={button} onClick={()=>setConfirmRestore(null)}>Cancel</button></div></div>}</div>
    {notice && <p role="status" style={{margin:0,padding:12,borderRadius:9,background:'var(--viz-card, #151515)',lineHeight:1.5}}>{notice}</p>}
  </section>;
}
