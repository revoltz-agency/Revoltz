import { useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Building2, Check, CheckCircle2, Download, Plus, Save, ShieldCheck, Users, WalletCards } from 'lucide-react';
import CoachingCenter from './CoachingCenter.jsx';

const TEAM_KEY = 'agencyos:business-team:v1';
const MONEY = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const inputStyle = { width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--viz-border, #333)', borderRadius: 9, padding: '10px 11px', background: 'var(--viz-card, #151515)', color: 'var(--viz-text, #f5f5f5)', font: 'inherit' };
const blankEmployee = () => ({ id: '', name: '', employeeCode: '', role: '', department: '', employmentType: 'Full-time', startDate: '', monthlySalary: '', status: 'Active' });

function readTeam() {
  try {
    const saved = JSON.parse(localStorage.getItem(TEAM_KEY) || '{}');
    return {
      employees: Array.isArray(saved.employees) ? saved.employees.slice(0, 500) : [],
      payrollRuns: Array.isArray(saved.payrollRuns) ? saved.payrollRuns.slice(0, 120) : [],
    };
  } catch { return { employees: [], payrollRuns: [] }; }
}
function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function currentPeriod() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; }
function money(value, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency || 'INR'} ${MONEY.format(Number(value) || 0)}`; }
}
function Header({ eyebrow, title, description, action }) {
  return <header className="business-page-heading"><div><span className="business-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}
function Field({ label, children, hint }) {
  return <label className="business-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function BusinessSetup({ initialProfile, onSave }) {
  const [form, setForm] = useState({
    name: initialProfile?.name || '', businessType: initialProfile?.businessType || '', industry: initialProfile?.industry || '',
    country: initialProfile?.country || 'India', currency: initialProfile?.currency || 'INR',
  });
  const [error, setError] = useState('');
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.businessType || !form.industry.trim()) { setError('Add your business name, business type, and industry to continue.'); return; }
    const now = new Date().toISOString();
    onSave({ ...form, name: form.name.trim().slice(0, 120), industry: form.industry.trim().slice(0, 100), createdAt: initialProfile?.createdAt || now, updatedAt: now });
  }
  return <main className="business-setup-page">
    <form className="business-setup-card" onSubmit={submit}>
      <div className="business-setup-mark"><BriefcaseBusiness size={23} /></div>
      <span className="business-eyebrow">YOUR BUSINESS WORKSPACE</span>
      <h1>Let’s set up your business.</h1>
      <p>AgencyOS will use these details to tailor your workspace. You can change them later in Business Profile.</p>
      <div className="business-form-grid">
        <Field label="Business name"><input autoFocus maxLength={120} required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Northstar Learning Centre" style={inputStyle} /></Field>
        <Field label="What kind of business is it?"><select required value={form.businessType} onChange={(event) => update('businessType', event.target.value)} style={inputStyle}><option value="">Choose a type</option>{['Agency or consulting', 'Education or coaching', 'Retail or ecommerce', 'Professional services', 'Food or hospitality', 'Health and wellness', 'Construction or trades', 'Manufacturing', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Industry"><input required maxLength={100} value={form.industry} onChange={(event) => update('industry', event.target.value)} placeholder="e.g. Entrance exam coaching" style={inputStyle} /></Field>
        <Field label="Country"><select value={form.country} onChange={(event) => update('country', event.target.value)} style={inputStyle}><option>India</option><option>United States</option><option>United Kingdom</option><option>United Arab Emirates</option><option>Australia</option><option>Other</option></select></Field>
        <Field label="Main currency"><select value={form.currency} onChange={(event) => update('currency', event.target.value)} style={inputStyle}>{[['INR','Indian rupee (INR)'],['USD','US dollar (USD)'],['GBP','Pound sterling (GBP)'],['AED','UAE dirham (AED)'],['AUD','Australian dollar (AUD)'],['EUR','Euro (EUR)'],['CAD','Canadian dollar (CAD)'],['SGD','Singapore dollar (SGD)']].map(([code,label]) => <option value={code} key={code}>{label}</option>)}</select></Field>
      </div>
      {error && <div className="business-inline-error" role="alert">{error}</div>}
      <button className="button button-primary business-setup-submit" type="submit">Create my workspace <ArrowRight size={16} /></button>
      <small className="business-setup-note"><ShieldCheck size={14} />One private workspace for your business account. Add a business name and type to personalize it.</small>
    </form>
  </main>;
}

export default function BusinessManagement({ profile, onUpdateProfile, onNavigate }) {
  const [tab, setTab] = useState('Overview');
  const [team, setTeam] = useState(readTeam);
  const [employeeForm, setEmployeeForm] = useState(null);
  const [profileForm, setProfileForm] = useState(profile);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [notice, setNotice] = useState('');
  const activeEmployees = team.employees.filter((employee) => employee.status === 'Active');
  const currentRun = useMemo(() => team.payrollRuns.find((run) => run.id === selectedRunId) || team.payrollRuns[0] || null, [team.payrollRuns, selectedRunId]);
  const payrollThisMonth = team.payrollRuns.find((run) => run.period === currentPeriod());
  const currentPayroll = payrollThisMonth?.entries.reduce((sum, entry) => sum + Number(entry.netPay || 0), 0) || 0;
  const currency = profile.currency || 'INR';
  const hasLearningCentre = profile.businessType === 'Education or coaching';

  function persistTeam(next) {
    setTeam(next);
    try { localStorage.setItem(TEAM_KEY, JSON.stringify(next)); setNotice('Team and payroll changes saved in this browser only. They do not sync to other devices.'); }
    catch { setNotice('Could not save these changes in this browser. Export a backup and remove older records.'); }
  }
  function saveEmployee(event) {
    event.preventDefault();
    const values = employeeForm;
    const salary = Number(values.monthlySalary);
    if (!values.name.trim() || !values.role.trim() || !Number.isFinite(salary) || salary < 0) return;
    const employee = { ...values, id: values.id || makeId(), name: values.name.trim().slice(0, 120), role: values.role.trim().slice(0, 100), department: values.department.trim().slice(0, 100), employeeCode: values.employeeCode.trim().slice(0, 40), monthlySalary: salary, updatedAt: new Date().toISOString() };
    const exists = team.employees.some((item) => item.id === employee.id);
    persistTeam({ ...team, employees: exists ? team.employees.map((item) => item.id === employee.id ? employee : item) : [employee, ...team.employees].slice(0, 500) });
    setEmployeeForm(null);
  }
  function setEmployeeStatus(employee, status) {
    persistTeam({ ...team, employees: team.employees.map((item) => item.id === employee.id ? { ...item, status, updatedAt: new Date().toISOString() } : item) });
  }
  function createPayroll() {
    const period = currentPeriod();
    const existing = team.payrollRuns.find((run) => run.period === period);
    if (existing) { setSelectedRunId(existing.id); setTab('Payroll'); setNotice(`A payroll record already exists for ${period}.`); return; }
    if (!activeEmployees.length) { setNotice('Add an active employee before creating payroll.'); return; }
    const entries = activeEmployees.map((employee) => ({ employeeId: employee.id, employeeCode: employee.employeeCode, name: employee.name, role: employee.role, baseSalary: Number(employee.monthlySalary) || 0, otherEarnings: 0, deductions: 0, netPay: Number(employee.monthlySalary) || 0 }));
    const run = { id: makeId(), period, status: 'Draft', createdAt: new Date().toISOString(), paidAt: '', entries };
    persistTeam({ ...team, payrollRuns: [run, ...team.payrollRuns].slice(0, 120) });
    setSelectedRunId(run.id); setTab('Payroll');
  }
  function updatePayrollEntry(employeeId, key, rawValue) {
    const runs = team.payrollRuns.map((run) => run.id !== currentRun?.id ? run : { ...run, entries: run.entries.map((entry) => {
      if (entry.employeeId !== employeeId) return entry;
      const maximum = key === 'deductions' ? Number(entry.baseSalary || 0) + Number(entry.otherEarnings || 0) : Number.MAX_SAFE_INTEGER;
      const value = Math.min(maximum, Math.max(0, Number(rawValue) || 0));
      const updated = { ...entry, [key]: value };
      updated.netPay = Math.max(0, Number(updated.baseSalary || 0) + Number(updated.otherEarnings || 0) - Number(updated.deductions || 0));
      return updated;
    }) });
    persistTeam({ ...team, payrollRuns: runs });
  }
  function recordPaid() {
    if (!currentRun || currentRun.status === 'Recorded as paid') return;
    const runs = team.payrollRuns.map((run) => run.id === currentRun.id ? { ...run, status: 'Recorded as paid', paidAt: new Date().toISOString() } : run);
    persistTeam({ ...team, payrollRuns: runs });
  }
  function exportPayroll() {
    if (!currentRun) return;
    const rows = [['Employee ID','Employee','Role','Base salary','Other earnings','Manual deductions','Net amount'], ...currentRun.entries.map((entry) => [entry.employeeCode,entry.name,entry.role,entry.baseSalary,entry.otherEarnings,entry.deductions,entry.netPay])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `payroll-${currentRun.period}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  function saveProfile(event) {
    event.preventDefault();
    if (!profileForm.name.trim() || !profileForm.industry.trim() || !profileForm.businessType) return;
    const updated = { ...profileForm, name: profileForm.name.trim().slice(0, 120), industry: profileForm.industry.trim().slice(0, 100), updatedAt: new Date().toISOString() };
    onUpdateProfile(updated); setNotice('Business profile updated.');
  }

  return <div className="business-management-page">
    <Header eyebrow="BUSINESS WORKSPACE" title={profile.name} description={`${profile.businessType} · ${profile.industry} · ${profile.country}`} action={<button className="button button-secondary" type="button" onClick={() => onNavigate('Data Backup')}><Download size={15} /> Data backup</button>} />
    <nav className="business-tabs" aria-label="Business management sections">{['Overview','Employees','Payroll',...(hasLearningCentre ? ['Centre Operations'] : []),'Business Profile'].map((item) => <button type="button" key={item} className={tab === item ? 'business-tab-active' : ''} aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item === 'Employees' ? <Users size={15} /> : item === 'Payroll' ? <WalletCards size={15} /> : item === 'Business Profile' ? <Building2 size={15} /> : item === 'Centre Operations' ? <BriefcaseBusiness size={15} /> : <BriefcaseBusiness size={15} />}{item}</button>)}</nav>
    {notice && <div className="business-notice" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

    {tab === 'Centre Operations' && hasLearningCentre && <CoachingCenter profile={profile} />}

    {tab === 'Overview' && <>
      <section className="business-welcome-card"><div><span className="business-eyebrow">YOUR BUSINESS HOME</span><h2>Welcome to {profile.name}</h2><p>Start with a team list, then prepare a monthly salary record. You stay in control of every change.</p></div><Building2 size={35} /></section>
      <section className="business-start-card" aria-labelledby="business-start-title">
        <div className="business-start-heading"><div><span className="business-eyebrow">A SIMPLE PLACE TO START</span><h2 id="business-start-title">Get your workspace ready</h2></div><span className="business-start-progress">{1 + Number(activeEmployees.length > 0) + Number(team.payrollRuns.length > 0)} of 3 done</span></div>
        <ol className="business-start-steps">
          <li className="business-start-step business-start-step-done"><CheckCircle2 size={19} /><div><strong>Set up your business</strong><small>{profile.name} · {profile.industry}</small></div><button type="button" onClick={() => setTab('Business Profile')}>Edit details</button></li>
          <li className={activeEmployees.length ? 'business-start-step business-start-step-done' : 'business-start-step'}>{activeEmployees.length ? <CheckCircle2 size={19} /> : <span className="business-step-number">2</span>}<div><strong>Add your team</strong><small>{activeEmployees.length ? activeEmployees.length + ' active ' + (activeEmployees.length === 1 ? 'employee' : 'employees') : 'Add names, roles, and monthly salary.'}</small></div><button type="button" onClick={() => { setTab('Employees'); if (!team.employees.length) setEmployeeForm(blankEmployee()); }}>{activeEmployees.length ? 'View team' : 'Add employee'}</button></li>
          <li className={team.payrollRuns.length ? 'business-start-step business-start-step-done' : 'business-start-step'}>{team.payrollRuns.length ? <CheckCircle2 size={19} /> : <span className="business-step-number">3</span>}<div><strong>Prepare monthly payroll</strong><small>{team.payrollRuns.length ? team.payrollRuns.length + ' payroll ' + (team.payrollRuns.length === 1 ? 'period' : 'periods') + ' saved' : 'Create a draft and review the amounts.'}</small></div><button type="button" disabled={!activeEmployees.length} onClick={createPayroll}>{team.payrollRuns.length ? 'Open payroll' : 'Prepare payroll'}</button></li>
        </ol>
        {hasLearningCentre && <button className="business-centre-shortcut" type="button" onClick={() => setTab('Centre Operations')}><BriefcaseBusiness size={17} /><span><strong>Run your learning centre</strong><small>Manage batches, attendance, and fee records.</small></span><ArrowRight size={16} /></button>}
      </section>
      <div className="business-stat-grid"><article><span>Active team</span><strong>{activeEmployees.length}</strong><small>{team.employees.length} employee records</small></article><article><span>This month's payroll</span><strong>{payrollThisMonth ? money(currentPayroll, currency) : 'Not prepared'}</strong><small>{payrollThisMonth?.status || 'No record yet'}</small></article><article><span>Past payrolls</span><strong>{team.payrollRuns.length}</strong><small>Saved salary records</small></article></div>
    </>}

    {tab === 'Employees' && <section className="business-panel">
      <div className="business-section-heading"><div><span className="business-eyebrow">PEOPLE</span><h2>Employees</h2><p>Keep a simple staff directory and current monthly salary for planning.</p></div><button className="button button-primary" type="button" onClick={() => setEmployeeForm(blankEmployee())}><Plus size={16} /> Add employee</button></div>
      {!team.employees.length ? <div className="business-empty"><Users size={24} /><strong>Your team list starts here.</strong><span>Add employees to build payroll records for this business.</span></div> : <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Employee</th><th>Role & department</th><th>Start date</th><th>Monthly salary</th><th>Status</th><th /></tr></thead><tbody>{team.employees.map((employee) => <tr key={employee.id}><td><strong>{employee.name}</strong><small>{employee.employeeCode || 'No employee ID'}</small></td><td><strong>{employee.role}</strong><small>{employee.department || employee.employmentType}</small></td><td>{employee.startDate || '—'}</td><td>{money(employee.monthlySalary, currency)}</td><td><span className={`business-status ${employee.status === 'Active' ? 'business-status-active' : ''}`}>{employee.status}</span></td><td><div className="business-row-actions"><button type="button" onClick={() => setEmployeeForm({ ...employee, monthlySalary: String(employee.monthlySalary ?? '') })}>Edit</button>{employee.status === 'Active' && <button type="button" onClick={() => setEmployeeStatus(employee, 'Inactive')}>Deactivate</button>}{employee.status === 'Inactive' && <button type="button" onClick={() => setEmployeeStatus(employee, 'Active')}>Reactivate</button>}</div></td></tr>)}</tbody></table></div>}
      <div className="business-privacy-note"><ShieldCheck size={16} /><span>For this early version, store only work details and salary amounts. Do not enter bank account, Aadhaar, PAN, tax, or identity-document numbers.</span></div>
    </section>}

    {tab === 'Payroll' && <section className="business-panel">
      <div className="business-section-heading"><div><span className="business-eyebrow">SALARY RECORDS</span><h2>Payroll</h2><p>Prepare a monthly salary summary and record when you have paid it.</p></div><button className="button button-primary" type="button" onClick={createPayroll}><Plus size={16} /> Create current month</button></div>
      <div className="business-payroll-caveat"><ShieldCheck size={16} /><span>This is a manual salary record, not statutory payroll software. It does not calculate tax, provident fund, insurance, overtime, payslips, filings, or transfer salary payments. Verify payroll with a qualified local professional.</span></div>
      {!team.payrollRuns.length ? <div className="business-empty"><WalletCards size={24} /><strong>No payroll periods yet.</strong><span>Add active employees, then create a monthly salary record.</span></div> : <>
        <div className="business-payroll-toolbar"><label>Payroll period<select value={currentRun?.id || ''} onChange={(event) => setSelectedRunId(event.target.value)}>{team.payrollRuns.map((run) => <option key={run.id} value={run.id}>{run.period} · {run.status}</option>)}</select></label><button className="button button-secondary" type="button" onClick={exportPayroll}><Download size={15} /> Export CSV</button></div>
        {currentRun && <><div className="business-payroll-summary"><div><span>Period</span><strong>{currentRun.period}</strong></div><div><span>Employees</span><strong>{currentRun.entries.length}</strong></div><div><span>Total net pay</span><strong>{money(currentRun.entries.reduce((sum, entry) => sum + Number(entry.netPay || 0), 0), currency)}</strong></div><span className={`business-status ${currentRun.status === 'Recorded as paid' ? 'business-status-active' : ''}`}>{currentRun.status}</span></div>
          <div className="business-table-wrap"><table className="business-table payroll-table"><thead><tr><th>Employee</th><th>Base salary</th><th>Other earnings</th><th>Manual deductions</th><th>Net amount</th></tr></thead><tbody>{currentRun.entries.map((entry) => <tr key={entry.employeeId}><td><strong>{entry.name}</strong><small>{entry.employeeCode || entry.role}</small></td><td>{money(entry.baseSalary, currency)}</td><td><input aria-label={`Other earnings for ${entry.name}`} type="number" min="0" step="0.01" value={entry.otherEarnings} onChange={(event) => updatePayrollEntry(entry.employeeId, 'otherEarnings', event.target.value)} disabled={currentRun.status === 'Recorded as paid'} style={inputStyle} /></td><td><input aria-label={`Manual deductions for ${entry.name}`} type="number" min="0" max={Number(entry.baseSalary || 0) + Number(entry.otherEarnings || 0)} step="0.01" value={entry.deductions} onChange={(event) => updatePayrollEntry(entry.employeeId, 'deductions', event.target.value)} disabled={currentRun.status === 'Recorded as paid'} style={inputStyle} /></td><td><strong>{money(entry.netPay, currency)}</strong></td></tr>)}</tbody></table></div>
          {currentRun.status !== 'Recorded as paid' ? <button className="button button-primary business-paid-button" type="button" onClick={recordPaid}><Check size={16} /> Record payroll as paid</button> : <div className="business-notice"><Check size={15} />Marked as paid on {new Date(currentRun.paidAt).toLocaleDateString()}</div>}
          <small className="business-payroll-note">“Record payroll as paid” only updates this tracker. It does not initiate a bank transfer.</small>
        </>}
      </>}
    </section>}

    {tab === 'Business Profile' && <section className="business-panel"><div className="business-section-heading"><div><span className="business-eyebrow">CUSTOMIZE</span><h2>Business profile</h2><p>These details shape this account's business workspace.</p></div></div><form className="business-form-grid business-profile-form" onSubmit={saveProfile}>
      <Field label="Business name"><input required maxLength={120} value={profileForm.name} onChange={(event) => setProfileForm((value) => ({ ...value, name: event.target.value }))} style={inputStyle} /></Field>
      <Field label="Business type"><select required value={profileForm.businessType} onChange={(event) => setProfileForm((value) => ({ ...value, businessType: event.target.value }))} style={inputStyle}>{['Agency or consulting', 'Education or coaching', 'Retail or ecommerce', 'Professional services', 'Food or hospitality', 'Health and wellness', 'Construction or trades', 'Manufacturing', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Industry"><input required maxLength={100} value={profileForm.industry} onChange={(event) => setProfileForm((value) => ({ ...value, industry: event.target.value }))} style={inputStyle} /></Field>
      <Field label="Country"><select value={profileForm.country} onChange={(event) => setProfileForm((value) => ({ ...value, country: event.target.value }))} style={inputStyle}>{['India','United States','United Kingdom','United Arab Emirates','Australia','Other'].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Main currency"><select value={profileForm.currency} onChange={(event) => setProfileForm((value) => ({ ...value, currency: event.target.value }))} style={inputStyle}>{['INR','USD','GBP','AED','AUD','EUR','CAD','SGD'].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <div className="business-profile-save"><button className="button button-primary" type="submit"><Save size={15} /> Save profile</button></div>
    </form></section>}

    {employeeForm && <div className="business-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEmployeeForm(null); }}><form className="business-employee-modal" onSubmit={saveEmployee}>
      <div className="business-section-heading"><div><span className="business-eyebrow">TEAM DIRECTORY</span><h2>{employeeForm.id ? 'Edit employee' : 'Add employee'}</h2><p>Do not add bank or government ID details.</p></div><button type="button" className="button button-secondary" onClick={() => setEmployeeForm(null)}>Close</button></div>
      <div className="business-form-grid"><Field label="Employee name"><input autoFocus required maxLength={120} value={employeeForm.name} onChange={(event) => setEmployeeForm((item) => ({ ...item, name: event.target.value }))} style={inputStyle} /></Field><Field label="Employee ID (optional)"><input maxLength={40} value={employeeForm.employeeCode} onChange={(event) => setEmployeeForm((item) => ({ ...item, employeeCode: event.target.value }))} style={inputStyle} /></Field><Field label="Job title"><input required maxLength={100} value={employeeForm.role} onChange={(event) => setEmployeeForm((item) => ({ ...item, role: event.target.value }))} style={inputStyle} /></Field><Field label="Department"><input maxLength={100} value={employeeForm.department} onChange={(event) => setEmployeeForm((item) => ({ ...item, department: event.target.value }))} style={inputStyle} /></Field><Field label="Employment type"><select value={employeeForm.employmentType} onChange={(event) => setEmployeeForm((item) => ({ ...item, employmentType: event.target.value }))} style={inputStyle}>{['Full-time','Part-time','Contractor','Temporary','Intern'].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Start date"><input type="date" value={employeeForm.startDate} onChange={(event) => setEmployeeForm((item) => ({ ...item, startDate: event.target.value }))} style={inputStyle} /></Field><Field label={`Monthly salary (${currency})`}><input required type="number" min="0" step="0.01" value={employeeForm.monthlySalary} onChange={(event) => setEmployeeForm((item) => ({ ...item, monthlySalary: event.target.value }))} style={inputStyle} /></Field><Field label="Status"><select value={employeeForm.status} onChange={(event) => setEmployeeForm((item) => ({ ...item, status: event.target.value }))} style={inputStyle}><option>Active</option><option>Inactive</option></select></Field></div>
      <div className="business-modal-actions"><button type="button" className="button button-secondary" onClick={() => setEmployeeForm(null)}>Cancel</button><button type="submit" className="button button-primary"><Save size={15} /> Save employee</button></div>
    </form></div>}
  </div>;
}
