import { useEffect, useState } from 'react';

function readCookie(name) {
  const prefix = `${name}=`;
  const entry = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    const csrf = readCookie('agencyos_workspace_csrf');
    if (csrf) headers['X-Workspace-CSRF'] = csrf;
  }
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Request failed. Please try again.'), { status: response.status });
  return payload;
}

export default function WorkspaceAccess({ children }) {
  const [status, setStatus] = useState('checking');
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    let alive = true;
    request('/api/workspace/me')
      .then(({ user: currentUser }) => {
        if (alive) { setUser(currentUser); setStatus('authenticated'); }
      })
      .catch((reason) => {
        if (!alive) return;
        // Keep the existing private/local installation usable if its database
        // is not configured. A real unauthenticated response must show sign-in.
        if (reason.status === 401) setStatus('anonymous');
        else setStatus('local');
      });
    return () => { alive = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const endpoint = mode === 'register' ? '/api/workspace/register' : '/api/workspace/login';
      const payload = await request(endpoint, { method: 'POST', body: JSON.stringify(form) });
      setUser(payload.user);
      setStatus('authenticated');
    } catch (reason) {
      setError(reason.message || 'Unable to access your workspace.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking') {
    return <main style={styles.screen}><div style={styles.card}><div style={styles.mark}>R</div><p style={styles.muted}>SECURE WORKSPACE</p><h1 style={styles.heading}>Opening AgencyOS…</h1><div style={styles.spinner} /></div></main>;
  }
  if (status === 'local') return children;
  if (status === 'authenticated') {
    return <div>
      <div style={styles.sessionBar}><span><strong>{user?.name || 'Workspace'}</strong><span style={styles.email}> {user?.email}</span></span><button type="button" style={styles.signOut} onClick={async () => {
        setError('');
        try {
          await request('/api/workspace/logout', { method: 'POST', body: '{}' });
          setUser(null); setStatus('anonymous'); setForm((current) => ({ ...current, password: '' }));
        } catch (reason) { setError(reason.message); }
      }}>Sign out</button></div>
      {error && <div role="alert" style={styles.sessionError}>{error}</div>}
      {children}
    </div>;
  }

  return <main style={styles.screen}>
    <section style={styles.card}>
      <div style={styles.mark}>R</div>
      <p style={styles.kicker}>REVOLTZ AI · AGENCYOS</p>
      <h1 style={styles.heading}>{mode === 'register' ? 'Create your workspace' : 'Welcome back'}</h1>
      <p style={styles.muted}>Sign in to access your private AgencyOS workspace.</p>
      <form onSubmit={submit} style={styles.form}>
        {mode === 'register' && <label style={styles.label}>Your name<input autoComplete="name" required minLength={2} maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={styles.input} placeholder="Your name" /></label>}
        <label style={styles.label}>Email address<input type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={styles.input} placeholder="you@company.com" /></label>
        <label style={styles.label}>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} style={styles.input} placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'} /></label>
        {error && <p role="alert" style={styles.error}>{error}</p>}
        <button type="submit" disabled={busy} style={styles.submit}>{busy ? 'Please wait…' : mode === 'register' ? 'Create workspace' : 'Sign in'} <span aria-hidden="true">→</span></button>
      </form>
      <p style={styles.switch}>{mode === 'register' ? 'Already have an account?' : 'New to AgencyOS?'} <button type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }} style={styles.switchButton}>{mode === 'register' ? 'Sign in' : 'Create account'}</button></p>
      <p style={styles.footnote}>Your account uses a private session cookie. Never share your password or API keys.</p>
    </section>
  </main>;
}

const styles = {
  screen: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '28px 16px', background: 'radial-gradient(ellipse at 50% 0%, rgba(112,52,255,.18), transparent 45%), #09090d', color: '#f6f4fb', fontFamily: 'Inter, system-ui, sans-serif' },
  card: { width: '100%', maxWidth: 430, boxSizing: 'border-box', padding: 32, border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, background: 'rgba(19,18,26,.94)', boxShadow: '0 24px 90px rgba(0,0,0,.36)' },
  mark: { display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#9d66ff,#5b35d5)', fontWeight: 900, fontSize: 23 },
  kicker: { margin: '22px 0 8px', color: '#b9a1ff', fontSize: 11, fontWeight: 800, letterSpacing: 2 },
  heading: { margin: '0 0 8px', fontSize: 28, letterSpacing: '-.8px' },
  muted: { color: '#a5a0b2', fontSize: 14, lineHeight: 1.6 },
  form: { display: 'grid', gap: 16, marginTop: 24 },
  label: { display: 'grid', gap: 8, color: '#d9d5e3', fontSize: 13, fontWeight: 650 },
  input: { width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 10, border: '1px solid #393442', background: '#100f15', color: '#fff', fontSize: 15, outlineColor: '#9d66ff' },
  submit: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', border: 0, borderRadius: 10, background: '#8b5cf6', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' },
  error: { margin: 0, color: '#ffaaa8', fontSize: 13, lineHeight: 1.5 },
  switch: { marginTop: 22, color: '#aaa5b6', fontSize: 13, textAlign: 'center' },
  switchButton: { border: 0, background: 'transparent', color: '#c6afff', fontWeight: 750, cursor: 'pointer', padding: 4 },
  footnote: { margin: '22px 0 0', paddingTop: 16, borderTop: '1px solid #302c38', color: '#817b8d', fontSize: 11, lineHeight: 1.6 },
  spinner: { width: 22, height: 22, border: '2px solid #3b334c', borderTopColor: '#a78bfa', borderRadius: '50%', marginTop: 20 },
  sessionBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '9px 18px', background: '#111017', color: '#e8e3f1', fontSize: 12, borderBottom: '1px solid #302b3a' },
  email: { color: '#a49daf', marginLeft: 6 },
  signOut: { border: '1px solid #494253', borderRadius: 8, padding: '7px 10px', background: 'transparent', color: '#eee9f7', cursor: 'pointer' },
  sessionError: { padding: 10, background: '#4b2028', color: '#ffd7dc', fontSize: 12 },
};
