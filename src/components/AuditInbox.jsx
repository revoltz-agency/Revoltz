import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Clock3, Inbox, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';

// Owner-only Audit Inbox.
//
// This component lives inside the AgencyOS workspace, so it is automatically
// excluded from the public GitHub Pages marketing build (VITE_PUBLIC_SITE_ONLY).
//
// Authentication: the browser never stores a password, session token or CSRF
// token. Signing in creates a server-side session returned as an HttpOnly cookie
// this code cannot read. State-changing calls echo the readable CSRF cookie in
// the X-Audit-CSRF header. Every request is sent with credentials: 'include'.

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'spam', label: 'Spam' },
];

// Spam is terminal by design: it cannot be moved back into the workflow.
const TRANSITIONS = {
  new: ['in_progress', 'closed', 'spam'],
  in_progress: ['closed', 'spam', 'new'],
  closed: ['new', 'in_progress'],
  spam: [],
};

const card = { background: 'var(--surface, #101720)', border: '1px solid var(--line, #202c38)', borderRadius: 14, padding: 18 };
const muted = { color: 'var(--muted, #7f8b99)', fontSize: 12 };

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

// The CSRF cookie is deliberately readable (it is the double-submit half), so
// the SPA can echo it straight from document.cookie. Nothing is persisted in
// localStorage or sessionStorage: the session token stays in its HttpOnly cookie.
function csrfFromCookie() {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const name = 'agencyos_audit_csrf';
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function daysLeft(value) {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

async function readError(response, fallback) {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export default function AuditInbox() {
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [requests, setRequests] = useState([]);
  const [retention, setRetention] = useState(null);
  const [purged, setPurged] = useState(0);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const response = await fetch('/api/audit/config', { credentials: 'include' });
      setConfig(await response.json());
      setAuthed(response.status === 200);
    } catch {
      setConfig(null);
      setError('Could not reach the Audit Inbox service.');
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadInbox = useCallback(async () => {
    const response = await fetch('/api/audit/requests', { credentials: 'include' });
    if (response.status === 401) {
      setAuthed(false);
      setRequests([]);
      return;
    }
    if (!response.ok) throw new Error(await readError(response, 'Could not load audit requests.'));
    const body = await response.json();
    setRequests(body.requests || []);
    setPurged(body.purgedExpired || 0);
    setAuthed(true);
  }, []);

  const loadRetention = useCallback(async () => {
    const response = await fetch('/api/audit/retention', { credentials: 'include' });
    if (!response.ok) return;
    setRetention(await response.json());
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (!authed) return;
    Promise.all([loadInbox(), loadRetention()]).catch((loadError) => setError(loadError.message));
  }, [authed, loadInbox, loadRetention]);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/audit/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Sign-in failed.'));
      await response.json();
      // No credential is persisted. The CSRF value is read from the readable
      // cookie on each state-changing call instead.
      setPassword('');
      setAuthed(true);
      setNotice('Signed in. This session expires automatically and can be ended with Sign out.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true); setError(''); setNotice('');
    try {
      await fetch('/api/audit/session/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Audit-CSRF': csrfFromCookie() },
        body: '{}',
      });
      setAuthed(false);
      setRequests([]);
      setRetention(null);
      setNotice('Signed out. The server-side session was revoked.');
    } catch (submitError) {
      setError('Sign-out failed.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id, status) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/audit/requests/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Audit-CSRF': csrfFromCookie() },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not update this request.'));
      await loadInbox();
      setNotice('Status updated.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this audit request permanently? This cannot be undone.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/audit/requests/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-Audit-CSRF': csrfFromCookie() },
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not delete this request.'));
      await loadInbox();
      setNotice('Audit request deleted.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadingConfig) {
    return <div style={{ ...card, textAlign: 'center', padding: 34 }}><LoaderCircle size={22} className="spin" style={{ margin: '0 auto 8px' }} /><p style={{ ...muted, margin: 0 }}>Checking Audit Inbox configuration…</p></div>;
  }

  if (!config?.configured) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ padding: 12, borderRadius: 10, background: '#2a3a4d', display: 'grid', placeItems: 'center' }}><ShieldCheck size={22} /></div>
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>Audit Inbox unavailable</h2>
            <p style={{ ...muted, margin: '0 0 10px', lineHeight: 1.6, maxWidth: 640 }}>
              The inbox is intentionally disabled until both <code>DATABASE_URL</code> and <code>AUDIT_OWNER_PASSWORD_HASH</code> are configured on the server. It never falls back to weaker authentication.
            </p>
            <p style={{ ...muted, margin: 0, lineHeight: 1.6, maxWidth: 640 }}>
              Public intake is configured separately through <code>AUDIT_PUBLIC_INTAKE_ENABLED</code>. The current Render Blueprint enables it, but the live service must be verified independently.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={{ ...card, maxWidth: 460 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ padding: 12, borderRadius: 10, background: '#2a3a4d', display: 'grid', placeItems: 'center' }}><Inbox size={22} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Audit Inbox sign in</h2>
            <p style={{ ...muted, margin: 0 }}>Owner access only.</p>
          </div>
        </div>
        <form onSubmit={signIn} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 650 }}>
            Owner password
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line, #333)', background: 'transparent', color: 'inherit', font: 'inherit' }}
              required
            />
          </label>
          <button type="submit" disabled={busy || !password} style={{ padding: '10px 14px', borderRadius: 9, border: 0, background: '#3f6ea8', color: '#fff', font: 'inherit', fontWeight: 650, cursor: 'pointer', opacity: busy || !password ? 0.5 : 1 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ ...muted, marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
          Your password is sent over HTTPS and never stored in the browser. The session lives on the server in an HttpOnly cookie and is revocable.
        </p>
        {error && <p style={{ color: '#ff9aa3', fontSize: 12, marginTop: 12, marginBottom: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 26 }}>Audit Inbox</h1>
          <p style={{ ...muted, margin: 0, maxWidth: 700, lineHeight: 1.6 }}>
            Requests submitted through the public “Claim Your Free Audit” form. Stored in Postgres, separate from prospect CRM data. No automatic email or WhatsApp message is ever sent.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => Promise.all([loadInbox(), loadRetention()]).catch((e) => setError(e.message))} disabled={busy} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--line, #333)', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" onClick={signOut} disabled={busy} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--line, #333)', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      {notice && <div style={{ ...card, padding: '10px 14px', borderColor: '#3f6b58', color: '#7fc3a5', fontSize: 12 }}>{notice}</div>}
      {error && <div style={{ ...card, padding: '10px 14px', borderColor: '#7a4450', color: '#e2939d', fontSize: 12 }}>{error}</div>}

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Clock3 size={18} style={{ flex: '0 0 auto', marginTop: 2 }} />
          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Retention · {retention?.retentionDays ?? config.retentionDays} days</strong>
            <p style={{ ...muted, margin: 0, lineHeight: 1.6 }}>
              Audit requests are scheduled for hard deletion {retention?.retentionDays ?? config.retentionDays} days after they arrive.
              {typeof retention?.expiredAwaitingDeletion === 'number' && ` ${retention.expiredAwaitingDeletion} row(s) are currently past expiry and awaiting deletion.`}
              {purged > 0 && ` ${purged} expired row(s) were removed when this page loaded.`}
            </p>
            <p style={{ ...muted, margin: 0, lineHeight: 1.6 }}>
              Status: <strong>configured and unit-tested</strong>. The scheduled cleanup job is <strong>not deployed or verified</strong> — see <code>docs/AUDIT_INBOX.md</code>. Opening this page also purges opportunistically, which is defence in depth, not proof of a schedule.
            </p>
          </div>
        </div>
      </div>

      {config.publicIntakeEnabled && (
        <div style={{ ...card, padding: '10px 14px', borderColor: '#8a7440', color: '#d9bd84', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={15} /> Public intake is <strong>enabled</strong> on this server.
        </div>
      )}

      {requests.length === 0
        ? <div style={{ ...card, textAlign: 'center', padding: 30 }}><Inbox size={24} style={{ margin: '0 auto 8px' }} /><p style={{ ...muted, margin: 0 }}>No audit requests yet.</p></div>
        : requests.map((request) => {
          const remaining = daysLeft(request.retentionExpiresAt);
          const allowed = TRANSITIONS[request.status] || [];
          return (
            <article key={request.id} style={{ ...card, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>{request.business}</h3>
                  <div style={muted}>{request.name} · <a href={`mailto:${encodeURIComponent(request.email)}`}>{request.email}</a> · {formatDate(request.createdAt)}</div>
                  {request.service && <div style={{ ...muted, marginTop: 2 }}>Service of interest: {request.service}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`audit-inbox-status audit-inbox-status-${request.status}`}>{STATUS_OPTIONS.find((option) => option.value === request.status)?.label || request.status}</span>
                  <button type="button" onClick={() => remove(request.id)} disabled={busy} aria-label={`Delete audit request from ${request.business}`} title="Delete permanently" style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line, #333)', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'inline-flex' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13 }}>{request.message}</p>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line, #202c38)', paddingTop: 10 }}>
                <span style={muted}>Deletes in {remaining === null ? '—' : `${remaining} day(s)`} · {formatDate(request.retentionExpiresAt)}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {allowed.length === 0
                    ? <span style={muted}>Terminal state — no further transitions.</span>
                    : allowed.map((status) => (
                      <button key={status} type="button" onClick={() => changeStatus(request.id, status)} disabled={busy} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line, #333)', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' }}>
                        Mark {STATUS_OPTIONS.find((option) => option.value === status)?.label || status}
                      </button>
                    ))}
                </div>
              </div>
            </article>
          );
        })}
    </div>
  );
}
