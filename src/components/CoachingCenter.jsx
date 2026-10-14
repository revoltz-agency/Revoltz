import { useMemo, useState } from 'react';
import { BookOpen, CalendarCheck2, Check, Download, Plus, ShieldCheck, Users, WalletCards } from 'lucide-react';

const STORAGE_KEY = 'agencyos:coaching-center:v1';
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => today().slice(0, 7);
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emptyData = () => ({ students: [], batches: [], attendance: [], fees: [] });
function readData() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Object.fromEntries(['students', 'batches', 'attendance', 'fees'].map((key) => [key, Array.isArray(value[key]) ? value[key].slice(0, key === 'attendance' ? 10000 : 5000) : []]));
  } catch { return emptyData(); }
}
function amount(value, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency || 'INR'} ${Number(value) || 0}`; }
}
const field = { width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--viz-border, #333)', borderRadius: 8, padding: '9px 10px', background: 'var(--viz-card, #151515)', color: 'var(--viz-text, #f5f5f5)', font: 'inherit' };
const button = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid var(--viz-border, #444)', borderRadius: 8, padding: '8px 11px', background: 'var(--viz-card, #151515)', color: 'var(--viz-text, #f5f5f5)', font: 'inherit', fontSize: 12, cursor: 'pointer' };

export default function CoachingCenter({ profile }) {
  const [data, setData] = useState(readData);
  const [section, setSection] = useState('Students');
  const [studentForm, setStudentForm] = useState(null);
  const [batchForm, setBatchForm] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [marks, setMarks] = useState({});
  const [notice, setNotice] = useState('');
  const currency = profile.currency || 'INR';
  const activeStudents = data.students.filter((student) => student.status === 'Active');
  const visibleStudents = useMemo(() => selectedBatch ? activeStudents.filter((student) => student.batchId === selectedBatch) : [], [activeStudents, selectedBatch]);
  const attendanceRecord = data.attendance.find((record) => record.batchId === selectedBatch && record.date === attendanceDate);

  function save(next, message = 'Saved to this business workspace.') {
    setData(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setNotice(message); }
    catch { setNotice('Could not save in this browser. Download a backup or clear browser storage.'); }
  }
  function saveBatch(event) {
    event.preventDefault();
    const name = batchForm.name.trim();
    if (!name) return;
    const record = { ...batchForm, id: batchForm.id || id(), name: name.slice(0, 100), course: batchForm.course.trim().slice(0, 100), updatedAt: new Date().toISOString() };
    const exists = data.batches.some((item) => item.id === record.id);
    save({ ...data, batches: exists ? data.batches.map((item) => item.id === record.id ? record : item) : [record, ...data.batches].slice(0, 500) }, 'Batch saved.');
    setSelectedBatch(record.id); setBatchForm(null);
  }
  function saveStudent(event) {
    event.preventDefault();
    const name = studentForm.name.trim();
    const fee = Number(studentForm.monthlyFee);
    if (!name || !studentForm.batchId || !Number.isFinite(fee) || fee < 0 || studentForm.adultConfirmed !== true) return;
    const record = { id: studentForm.id || id(), name: name.slice(0, 120), studentCode: studentForm.studentCode.trim().slice(0, 40), batchId: studentForm.batchId, monthlyFee: fee, status: studentForm.status || 'Active', updatedAt: new Date().toISOString() };
    const exists = data.students.some((item) => item.id === record.id);
    save({ ...data, students: exists ? data.students.map((item) => item.id === record.id ? record : item) : [record, ...data.students].slice(0, 5000) }, 'Learner record saved.');
    setStudentForm(null);
  }
  function saveAttendance() {
    if (!selectedBatch || !visibleStudents.length) { setNotice('Choose a batch with active learners before marking attendance.'); return; }
    const entries = visibleStudents.map((student) => ({ studentId: student.id, status: marks[student.id] || attendanceRecord?.entries?.find((entry) => entry.studentId === student.id)?.status || 'Unmarked' }));
    if (entries.some((entry) => entry.status === 'Unmarked')) { setNotice('Mark every learner present, absent, or late before saving attendance.'); return; }
    const visibleIds = new Set(entries.map((entry) => entry.studentId));
    const preservedEntries = (attendanceRecord?.entries || []).filter((entry) => !visibleIds.has(entry.studentId));
    const record = { id: attendanceRecord?.id || id(), date: attendanceDate, batchId: selectedBatch, entries: [...entries, ...preservedEntries], updatedAt: new Date().toISOString() };
    const exists = data.attendance.some((item) => item.id === record.id);
    save({ ...data, attendance: exists ? data.attendance.map((item) => item.id === record.id ? record : item) : [record, ...data.attendance].slice(0, 10000) }, 'Attendance saved.');
    setMarks({});
  }
  function createMonthlyFees() {
    const period = monthNow();
    const known = new Set(data.fees.filter((fee) => fee.period === period).map((fee) => fee.studentId));
    const newFees = activeStudents.filter((student) => !known.has(student.id)).map((student) => ({ id: id(), studentId: student.id, period, amount: Number(student.monthlyFee) || 0, status: 'Due', paidAt: '' }));
    if (!newFees.length) { setNotice(`Fee records already exist for all active learners in ${period}.`); return; }
    save({ ...data, fees: [...newFees, ...data.fees].slice(0, 10000) }, `${newFees.length} fee records created for ${period}.`);
  }
  function markReceived(fee) {
    save({ ...data, fees: data.fees.map((item) => item.id === fee.id ? { ...item, status: 'Received', paidAt: today() } : item) }, 'Marked as received. No payment was processed.');
  }
  function exportFees() {
    const csvRows = [['Period', 'Learner', 'Student code', 'Batch', 'Amount', 'Status', 'Recorded date'], ...data.fees.map((fee) => {
      const student = data.students.find((item) => item.id === fee.studentId);
      const batch = data.batches.find((item) => item.id === student?.batchId);
      return [fee.period, student?.name || 'Removed learner', student?.studentCode || '', batch?.name || '', fee.amount, fee.status, fee.paidAt || ''];
    })];
    const content = csvRows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'coaching-fee-register.csv'; link.click(); URL.revokeObjectURL(url);
  }
  function switchSection(value) { setSection(value); setNotice(''); }

  return <section className="coaching-center">
    <header className="coaching-heading"><div><span className="business-eyebrow">{profile.name} · LEARNING CENTRE</span><h2>Centre operations</h2><p>Manage batches, learner attendance, and fee records in one workspace.</p></div></header>
    <nav className="coaching-tabs" aria-label="Learning centre sections">{[['Students', Users], ['Batches', BookOpen], ['Attendance', CalendarCheck2], ['Fees', WalletCards]].map(([name, Icon]) => <button key={name} type="button" className={section === name ? 'coaching-tab-active' : ''} onClick={() => switchSection(name)}><Icon size={15} />{name}</button>)}</nav>
    <div className="coaching-data-note"><ShieldCheck size={16} /><span>Privacy first: this pilot is for adult learners. It stores only a learner name, optional centre ID, batch, attendance, and fee status. Do not enter phone numbers, addresses, birth dates, exam results, health details, or minors’ data. Confirm your centre has appropriate notice and consent before using learner records.</span></div>
    {notice && <div className="business-notice" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

    {section === 'Students' && <section className="business-panel"><div className="business-section-heading"><div><span className="business-eyebrow">LEARNER REGISTER</span><h2>Students</h2><p>Names and course administration only; no contact or identity documents.</p></div><button type="button" className="button button-primary" onClick={() => setStudentForm({ id: '', name: '', studentCode: '', batchId: data.batches[0]?.id || '', monthlyFee: '', status: 'Active', adultConfirmed: false })}><Plus size={15} /> Add learner</button></div>
      {!data.batches.length ? <div className="business-empty"><BookOpen size={24} /><strong>Create a batch first.</strong><span>Each learner belongs to one active batch.</span><button style={button} type="button" onClick={() => switchSection('Batches')}>Open batches</button></div> : !data.students.length ? <div className="business-empty"><Users size={24} /><strong>No learner records yet.</strong><span>Add an adult learner to start the register.</span></div> : <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Learner</th><th>Batch</th><th>Monthly fee</th><th>Status</th><th /></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.studentCode || 'No centre ID'}</small></td><td>{data.batches.find((batch) => batch.id === student.batchId)?.name || 'Batch removed'}</td><td>{amount(student.monthlyFee, currency)}</td><td>{student.status}</td><td><div className="business-row-actions"><button type="button" onClick={() => setStudentForm({ ...student, adultConfirmed: true })}>Edit</button><button type="button" onClick={() => save({ ...data, students: data.students.map((item) => item.id === student.id ? { ...item, status: item.status === 'Active' ? 'Inactive' : 'Active' } : item) }, `Learner ${student.status === 'Active' ? 'deactivated' : 'reactivated'}.`)}>{student.status === 'Active' ? 'Deactivate' : 'Reactivate'}</button></div></td></tr>)}</tbody></table></div>}
      {studentForm && <form className="coaching-form-card" onSubmit={saveStudent}><h3>{studentForm.id ? 'Edit learner record' : 'Add adult learner'}</h3><div className="business-form-grid"><label className="business-field">Learner name<input autoFocus required maxLength={120} style={field} value={studentForm.name} onChange={(event) => setStudentForm((value) => ({ ...value, name: event.target.value }))} /></label><label className="business-field">Centre ID (optional)<input maxLength={40} style={field} value={studentForm.studentCode} onChange={(event) => setStudentForm((value) => ({ ...value, studentCode: event.target.value }))} /></label><label className="business-field">Batch<select required style={field} value={studentForm.batchId} onChange={(event) => setStudentForm((value) => ({ ...value, batchId: event.target.value }))}><option value="">Choose a batch</option>{data.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label><label className="business-field">Monthly fee ({currency})<input required type="number" min="0" step="0.01" style={field} value={studentForm.monthlyFee} onChange={(event) => setStudentForm((value) => ({ ...value, monthlyFee: event.target.value }))} /></label><label className="business-field">Status<select style={field} value={studentForm.status || 'Active'} onChange={(event) => setStudentForm((value) => ({ ...value, status: event.target.value }))}><option>Active</option><option>Inactive</option></select></label><label className="coaching-consent-check"><input required type="checkbox" checked={Boolean(studentForm.adultConfirmed)} onChange={(event) => setStudentForm((value) => ({ ...value, adultConfirmed: event.target.checked }))} />I confirm this learner is 18 or older.</label></div><div className="business-modal-actions"><button type="button" style={button} onClick={() => setStudentForm(null)}>Cancel</button><button type="submit" className="button button-primary"><Check size={15} /> Save learner</button></div></form>}
    </section>}

    {section === 'Batches' && <section className="business-panel"><div className="business-section-heading"><div><span className="business-eyebrow">CLASSES</span><h2>Batches</h2><p>Organize enrolments by course or timetable group.</p></div><button type="button" className="button button-primary" onClick={() => setBatchForm({ id: '', name: '', course: '', schedule: '' })}><Plus size={15} /> Add batch</button></div>
      {!data.batches.length ? <div className="business-empty"><BookOpen size={24} /><strong>No batches yet.</strong><span>Create your first batch to add learner records.</span></div> : <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Batch</th><th>Course</th><th>Schedule</th><th>Learners</th><th /></tr></thead><tbody>{data.batches.map((batch) => <tr key={batch.id}><td><strong>{batch.name}</strong></td><td>{batch.course || '—'}</td><td>{batch.schedule || '—'}</td><td>{data.students.filter((student) => student.batchId === batch.id && student.status === 'Active').length}</td><td><button type="button" style={button} onClick={() => setBatchForm({ ...batch })}>Edit</button></td></tr>)}</tbody></table></div>}
      {batchForm && <form className="coaching-form-card" onSubmit={saveBatch}><h3>{batchForm.id ? 'Edit batch' : 'Add batch'}</h3><div className="business-form-grid"><label className="business-field">Batch name<input autoFocus required maxLength={100} style={field} value={batchForm.name} onChange={(event) => setBatchForm((value) => ({ ...value, name: event.target.value }))} /></label><label className="business-field">Course or subject<input maxLength={100} style={field} value={batchForm.course} onChange={(event) => setBatchForm((value) => ({ ...value, course: event.target.value }))} /></label><label className="business-field">Schedule (optional)<input maxLength={120} style={field} value={batchForm.schedule} onChange={(event) => setBatchForm((value) => ({ ...value, schedule: event.target.value }))} placeholder="e.g. Mon–Wed, 6 pm" /></label></div><div className="business-modal-actions"><button type="button" style={button} onClick={() => setBatchForm(null)}>Cancel</button><button type="submit" className="button button-primary"><Check size={15} /> Save batch</button></div></form>}
    </section>}

    {section === 'Attendance' && <section className="business-panel"><div className="business-section-heading"><div><span className="business-eyebrow">DAILY REGISTER</span><h2>Attendance</h2><p>Save one attendance register per batch and date.</p></div></div><div className="coaching-attendance-controls"><label className="business-field">Batch<select style={field} value={selectedBatch} onChange={(event) => { setSelectedBatch(event.target.value); setMarks({}); }}><option value="">Choose a batch</option>{data.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label><label className="business-field">Date<input type="date" style={field} value={attendanceDate} onChange={(event) => { setAttendanceDate(event.target.value); setMarks({}); }} /></label></div>{visibleStudents.length ? <><div className="business-table-wrap"><table className="business-table"><thead><tr><th>Learner</th><th>Attendance</th></tr></thead><tbody>{visibleStudents.map((student) => { const value = marks[student.id] || attendanceRecord?.entries?.find((entry) => entry.studentId === student.id)?.status || 'Unmarked'; return <tr key={student.id}><td><strong>{student.name}</strong><small>{student.studentCode || ''}</small></td><td><select style={field} aria-label={`Attendance for ${student.name}`} value={value} onChange={(event) => setMarks((current) => ({ ...current, [student.id]: event.target.value }))}><option>Unmarked</option><option>Present</option><option>Absent</option><option>Late</option></select></td></tr>; })}</tbody></table></div><button type="button" className="button button-primary" onClick={saveAttendance}><Check size={15} /> Save attendance</button></> : <div className="business-empty"><CalendarCheck2 size={24} /><strong>Choose a batch with active learners.</strong><span>Create batches and learner records first.</span></div>}</section>}

    {section === 'Fees' && <section className="business-panel"><div className="business-section-heading"><div><span className="business-eyebrow">FEE REGISTER</span><h2>Fees</h2><p>Track amounts due and manually record amounts received.</p></div><div className="coaching-fee-actions"><button type="button" style={button} onClick={exportFees}><Download size={15} /> Export CSV</button><button type="button" className="button button-primary" onClick={createMonthlyFees}><Plus size={15} /> Create this month's fees</button></div></div><div className="coaching-fee-note"><ShieldCheck size={15} /><span>This only records fee status. It does not collect payments, issue tax invoices, or send reminders.</span></div>{!data.fees.length ? <div className="business-empty"><WalletCards size={24} /><strong>No fee records yet.</strong><span>Add active learner records, then create this month's fees.</span></div> : <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Period</th><th>Learner</th><th>Batch</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{data.fees.map((fee) => { const student = data.students.find((item) => item.id === fee.studentId); const batch = data.batches.find((item) => item.id === student?.batchId); return <tr key={fee.id}><td>{fee.period}</td><td><strong>{student?.name || 'Removed learner'}</strong></td><td>{batch?.name || '—'}</td><td>{amount(fee.amount, currency)}</td><td>{fee.status}{fee.paidAt ? <small>{fee.paidAt}</small> : null}</td><td>{fee.status === 'Due' && <button style={button} type="button" onClick={() => markReceived(fee)}>Mark received</button>}</td></tr>; })}</tbody></table></div>}</section>}
  </section>;
}
