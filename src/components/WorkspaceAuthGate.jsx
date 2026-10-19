import { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, Mail, UserRound, ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';
import App from '../App.jsx';
import { WORKSPACE_STORAGE_KEYS } from '../lib/workspaceStorageKeys.js';

const SESSION_COOKIE = 'agencyos_workspace_csrf';
const VERCEL_PREVIEW = import.meta.env.VERCEL_ENV === 'preview';
const SYNC_EVENT = 'agencyos:workspace-sync';

function reportSyncStatus(status) {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { status } }));
}

function csrfFromCookie() {
  if (!document.cookie) return '';
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : '';
}

const LEGACY_WORKSPACE_KEYS = new Set(WORKSPACE_STORAGE_KEYS);

function mergeLegacyValue(key, cloudValue, legacyValue) {
  if (typeof cloudValue !== 'string') return legacyValue;
  if (typeof legacyValue !== 'string' || cloudValue === legacyValue) return cloudValue;
  try {
    const cloud = JSON.parse(cloudValue);
    const legacy = JSON.parse(legacyValue);
    if (key === 'agencyos:workflow:v1' || key === 'agencyos:manual-lead-overrides:v1') {
      return JSON.stringify({ ...(legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {}), ...(cloud && typeof cloud === 'object' && !Array.isArray(cloud) ? cloud : {}) });
    }
    if (key === 'agencyos:manual-leads:v1' && Array.isArray(cloud) && Array.isArray(legacy)) {
      const byId = new Map();
      for (const item of legacy) if (item && typeof item.id === 'string') byId.set(item.id, item);
      for (const item of cloud) if (item && typeof item.id === 'string') byId.set(item.id, item);
      return JSON.stringify([...byId.values()].slice(-1000));
    }
    if ((key === 'agencyos:saved-place-ids:v1' || key === 'agencyos:saved-gemini-place-ids:v1') && Array.isArray(cloud) && Array.isArray(legacy)) {
      return JSON.stringify([...new Set([...legacy, ...cloud].filter((id) => typeof id === 'string'))].slice(-500));
    }
    if (key === 'agencyos:search-history:v1' && Array.isArray(cloud) && Array.isArray(legacy)) {
      const seen = new Set();
      return JSON.stringify([...cloud, ...legacy].filter((item) => {
        const signature = JSON.stringify(item);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      }).slice(0, 8));
    }
  } catch { /* Keep the valid cloud value when a legacy value is malformed. */ }
  return cloudValue;
}

function installWorkspaceStorage(userId, remoteState, initialRevision = null) {
  const prefix = `agencyos:account:${userId}:`;
  const proto = Storage.prototype;
  const native = {
    getItem: proto.getItem,
    setItem: proto.setItem,
    removeItem: proto.removeItem,
    clear: proto.clear,
    key: proto.key,
    length: Object.getOwnPropertyDescriptor(proto, 'length'),
  };
  let active = true;
  let syncTimer = null;
  let inFlight = Promise.resolve();
  let syncVersion = 0;
  let serverRevision = initialRevision;

  // Migrate the older, un-namespaced browser cache without discarding it.
  // The cloud wins conflicts, while distinct legacy leads/CRM entries are merged.
  const legacyState = {};
  for (const key of LEGACY_WORKSPACE_KEYS) {
    const value = native.getItem.call(window.localStorage, key);
    if (value !== null) legacyState[key] = value;
  }
  const mergedState = { ...(remoteState || {}) };
  for (const [key, value] of Object.entries(legacyState)) {
    mergedState[key] = mergeLegacyValue(key, mergedState[key], value);
  }

  // Seed only this account's browser cache from its merged cloud snapshot. Other
  // accounts' namespaced values are untouched and never visible through the app.
  for (let i = native.length.get.call(window.localStorage) - 1; i >= 0; i -= 1) {
    const key = native.key.call(window.localStorage, i);
    if (key?.startsWith(prefix)) native.removeItem.call(window.localStorage, key);
  }
  for (const [key, value] of Object.entries(mergedState)) {
    if (typeof key === 'string' && typeof value === 'string' && key.length <= 300) {
      native.setItem.call(window.localStorage, prefix + key, value);
    }
  }

  // Preserve the legacy keys until the merged snapshot has successfully reached
  // the server. This avoids losing pre-account data if cloud sync is unavailable.
  let migrationPending = Object.keys(legacyState).length > 0;

  function collectState() {
    const state = {};
    const storage = window.localStorage;
    for (let i = 0; i < native.length.get.call(storage); i += 1) {
      const key = native.key.call(storage, i);
      if (key?.startsWith(prefix)) state[key.slice(prefix.length)] = native.getItem.call(storage, key);
    }
    return state;
  }
  function scheduleSync() {
    if (!active) return;
    const version = ++syncVersion;
    reportSyncStatus('saving');
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      const state = collectState();
      inFlight = inFlight.catch(() => {}).then(async () => {
        if (!active) return;
        const response = await fetch('/api/workspace/state', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Workspace-CSRF': csrfFromCookie() },
          body: JSON.stringify({ state, expectedRevision: serverRevision }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 409) {
          reportSyncStatus('conflict');
          return;
        }
        if (!response.ok) throw new Error('Workspace cloud sync failed.');
        if (Number.isSafeInteger(result.revision)) serverRevision = result.revision;
        if (version === syncVersion) reportSyncStatus('saved');
        if (migrationPending) {
          for (const key of Object.keys(legacyState)) native.removeItem.call(window.localStorage, key);
          migrationPending = false;
        }
      }).catch(() => {
        // Keep the local cache usable while offline; the next edit retries sync.
        if (version === syncVersion) reportSyncStatus('offline');
      });
    }, 700);
  }
  const retryWhenOnline = () => scheduleSync();
  window.addEventListener('online', retryWhenOnline);

  proto.getItem = function (key) {
    return this === window.localStorage
      ? native.getItem.call(this, prefix + String(key))
      : native.getItem.call(this, key);
  };
  proto.setItem = function (key, value) {
    if (this !== window.localStorage) return native.setItem.call(this, key, value);
    native.setItem.call(this, prefix + String(key), String(value));
    scheduleSync();
  };
  proto.removeItem = function (key) {
    if (this !== window.localStorage) return native.removeItem.call(this, key);
    native.removeItem.call(this, prefix + String(key));
    scheduleSync();
  };
  proto.clear = function () {
    if (this !== window.localStorage) return native.clear.call(this);
    for (let i = native.length.get.call(this) - 1; i >= 0; i -= 1) {
      const key = native.key.call(this, i);
      if (key?.startsWith(prefix)) native.removeItem.call(this, key);
    }
    scheduleSync();
  };
  proto.key = function (index) {
    if (this !== window.localStorage) return native.key.call(this, index);
    const keys = [];
    for (let i = 0; i < native.length.get.call(this); i += 1) {
      const key = native.key.call(this, i);
      if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length));
    }
    return keys[index] ?? null;
  };
  Object.defineProperty(proto, 'length', {
    configurable: true,
    enumerable: true,
    get() {
      if (this !== window.localStorage) return native.length.get.call(this);
      let count = 0;
      for (let i = 0; i < native.length.get.call(this); i += 1) {
        if (native.key.call(this, i)?.startsWith(prefix)) count += 1;
      }
      return count;
    },
  });

  async function recoverFromConflict() {
    if (!active) throw new Error('This workspace session has ended.');
    // Save the current browser snapshot before replacing anything with the server copy.
    const backupKey = `agencyos:conflict-backup:${userId}:${Date.now()}`;
    const backup = { userId, savedAt: new Date().toISOString(), state: collectState() };
    native.setItem.call(window.localStorage, backupKey, JSON.stringify(backup));
    const response = await fetch('/api/workspace/state', { credentials: 'include', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.state || typeof result.state !== 'object') {
      throw new Error('Your local backup was preserved, but the latest workspace could not be loaded. Try again.');
    }
    window.clearTimeout(syncTimer);
    syncVersion += 1;
    for (let i = native.length.get.call(window.localStorage) - 1; i >= 0; i -= 1) {
      const key = native.key.call(window.localStorage, i);
      if (key?.startsWith(prefix)) native.removeItem.call(window.localStorage, key);
    }
    for (const [key, value] of Object.entries(result.state)) {
      if (typeof key === 'string' && typeof value === 'string' && key.length <= 300) {
        native.setItem.call(window.localStorage, prefix + key, value);
      }
    }
    serverRevision = Number.isSafeInteger(result.revision) ? result.revision : null;
    reportSyncStatus('saved');
    window.location.reload();
    return backupKey;
  }
  window.__agencyOSRecoverWorkspace = recoverFromConflict;

  if (migrationPending) scheduleSync();

  return () => {
    active = false;
    if (window.__agencyOSRecoverWorkspace === recoverFromConflict) delete window.__agencyOSRecoverWorkspace;
    window.clearTimeout(syncTimer);
    window.removeEventListener('online', retryWhenOnline);
    proto.getItem = native.getItem;
    proto.setItem = native.setItem;
    proto.removeItem = native.removeItem;
    proto.clear = native.clear;
    proto.key = native.key;
    Object.defineProperty(proto, 'length', native.length);
  };
}

export default function WorkspaceAuthGate() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [syncStatus, setSyncStatus] = useState(VERCEL_PREVIEW ? 'preview' : 'saved');
  const [cleanupStorage, setCleanupStorage] = useState(null);
  const [recoveringConflict, setRecoveringConflict] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [billingStatus, setBillingStatus] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');

  const loadWorkspace = useCallback(async (account) => {
    const response = await fetch('/api/workspace/state', { credentials: 'include', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (response.status === 402 && result.code === 'subscription_required') {
      window.__agencyOSUser = account;
      setUser(account);
      setSubscriptionRequired(true);
      setStorageReady(true);
      return;
    }
    if (!response.ok) throw new Error('Could not load your saved workspace. Please sign in again.');
    const cleanup = installWorkspaceStorage(account.id, result.state || {}, Number.isSafeInteger(result.revision) ? result.revision : null);
    setSubscriptionRequired(false);
    setSyncStatus('saved');
    window.__agencyOSUser = account;
    setCleanupStorage(() => cleanup);
    setUser(account);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (VERCEL_PREVIEW) {
      const previewAccount = { id: 'preview-local', name: 'Preview workspace', email: 'preview@local.test' };
      window.__agencyOSPreview = true;
      window.__agencyOSUser = previewAccount;
      setUser(previewAccount);
      setStorageReady(true);
      setBusy(false);
      return () => { window.__agencyOSPreview = false; window.__agencyOSUser = null; };
    }
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/api/workspace/me', { credentials: 'include', cache: 'no-store' });
        if (response.ok) {
          const body = await response.json();
          if (alive) await loadWorkspace(body.user);
        }
      } catch {
        if (alive) setError('Could not reach the sign-in service. Check your connection and try again.');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [loadWorkspace]);

  useEffect(() => {
    const handleSyncStatus = (event) => setSyncStatus(event.detail?.status || 'saved');
    window.addEventListener(SYNC_EVENT, handleSyncStatus);
    return () => window.removeEventListener(SYNC_EVENT, handleSyncStatus);
  }, []);

  useEffect(() => {
    if (!user || !storageReady || VERCEL_PREVIEW) return;
    let alive = true;
    (async () => {
      try {
        const [configResponse, statusResponse] = await Promise.all([
          fetch('/api/billing/config', { cache: 'no-store' }),
          fetch('/api/billing/status', { credentials: 'include', cache: 'no-store' }),
        ]);
        const config = await configResponse.json().catch(() => ({}));
        const status = await statusResponse.json().catch(() => ({}));
        if (!alive) return;
        setBillingConfigured(config.configured === true);
        setBillingStatus(status.subscription?.status || '');
      } catch { /* Billing is optional until the owner configures Razorpay. */ }
    })();
    return () => { alive = false; };
  }, [user, storageReady]);

  async function startSubscription() {
    setBillingLoading(true);
    setBillingError('');
    try {
      const response = await fetch('/api/billing/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-CSRF': csrfFromCookie() },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not start subscription.');
      if (!result.shortUrl) throw new Error('Razorpay did not return a checkout link.');
      window.location.assign(result.shortUrl);
    } catch (error) {
      setBillingError(error?.message || 'Could not start subscription.');
      setBillingLoading(false);
    }
  }

  useEffect(() => () => {
    cleanupStorage?.();
    window.__agencyOSUser = null;
  }, [cleanupStorage]);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/workspace/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Workspace-CSRF': csrfFromCookie() },
      });
    } finally {
      cleanupStorage?.();
      setCleanupStorage(null);
      setUser(null);
      setStorageReady(false);
      setSubscriptionRequired(false);
      setBillingConfigured(false);
      setBillingStatus('');
      setBillingLoading(false);
      setBillingError('');
      setSyncStatus('saved');
      window.__agencyOSUser = null;
      setPassword('');
      setError('');
    }
  }, [cleanupStorage]);

  useEffect(() => {
    window.addEventListener('agencyos:logout', signOut);
    return () => window.removeEventListener('agencyos:logout', signOut);
  }, [signOut]);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const endpoint = mode === 'register' ? '/api/workspace/register' : '/api/workspace/login';
      const payload = mode === 'register' ? { name, email, password } : { email, password };
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not sign in. Please try again.');
      await loadWorkspace(body.user);
      setPassword('');
    } catch (submitError) {
      setError(submitError.message || 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (busy) {
    return <div className="workspace-auth-page"><div className="workspace-auth-card"><LoaderCircle className="spin" size={24} /><p>Checking your workspace session…</p></div></div>;
  }
  if (user && storageReady && subscriptionRequired) {
    return <div className="workspace-auth-page"><section className="workspace-auth-card">
      <div className="workspace-auth-mark">R</div>
      <div className="workspace-auth-eyebrow">REVOLTZ AI · AGENCYOS</div>
      <h1>Choose your monthly plan</h1>
      <p className="workspace-auth-description">Your account is signed in. An active subscription is required to open this workspace. Continue to Razorpay to review the plan price and terms before approving payment.</p>
      {billingConfigured ? <button className="workspace-auth-submit" type="button" disabled={billingLoading} onClick={startSubscription}>{billingLoading ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{billingLoading ? 'Opening secure checkout…' : 'Continue to Razorpay checkout'}</button> : <p className="workspace-auth-error">Subscription checkout is not configured yet. Please contact Revoltz support.</p>}
      {billingError && <div className="workspace-auth-error" role="alert">{billingError}</div>}
      <button className="workspace-auth-switch" type="button" onClick={() => window.location.reload()}>I have completed payment — check again</button>
      <div className="workspace-auth-security"><ShieldCheck size={14} /> Access is granted only after the server verifies an active subscription.</div>
    </section></div>;
  }

  if (user && storageReady) {
    const syncLabels = {
      saved: 'All changes saved to your account',
      saving: 'Saving changes to your account…',
      offline: 'Not synced — changes are saved only in this browser. Sync will retry when you are online.',
      preview: 'Preview only — data stays in this browser',
      conflict: 'Sync paused — workspace changed elsewhere. Reload before making more changes to avoid overwriting newer data.',
    };
    const warning = syncStatus === 'offline' || syncStatus === 'preview' || syncStatus === 'conflict';
    return <>
      <div role="status" aria-live="polite" style={{ position: 'fixed', zIndex: 1100, top: 10, right: 12, maxWidth: 'min(420px, calc(100vw - 24px))', padding: '8px 11px', border: `1px solid ${warning ? '#84683b' : '#375b48'}`, borderRadius: 9, background: warning ? '#282319' : '#14221c', color: warning ? '#e5d2a4' : '#a9d9b8', fontSize: 12, lineHeight: 1.4, boxShadow: '0 4px 18px #0005' }}>
        {syncLabels[syncStatus] || syncLabels.saved}
        {syncStatus === 'conflict' && <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 7 }}>Your current browser changes will be backed up before the latest cloud copy is loaded. You can recover the backup from browser storage if needed.</div>
          <button type="button" disabled={recoveringConflict} onClick={async () => {
            setRecoveringConflict(true);
            setRecoveryError('');
            try { await window.__agencyOSRecoverWorkspace?.(); }
            catch (error) { setRecoveryError(error?.message || 'Could not reload the latest workspace.'); }
            finally { setRecoveringConflict(false); }
          }} style={{ border: '1px solid #bda36d', borderRadius: 6, padding: '6px 9px', background: '#3a3020', color: '#f2dfb0', cursor: recoveringConflict ? 'wait' : 'pointer' }}>
            {recoveringConflict ? 'Backing up and reloading…' : 'Back up local changes & reload'}
          </button>
          {recoveryError && <div role="alert" style={{ marginTop: 6 }}>{recoveryError}</div>}
        </div>}
      </div>
      {billingConfigured && billingStatus !== 'active' && <div style={{ position: 'fixed', zIndex: 1099, top: 66, right: 12, maxWidth: 'min(420px, calc(100vw - 24px))', padding: '10px 12px', border: '1px solid #654b7d', borderRadius: 9, background: '#21192a', color: '#eadcf7', fontSize: 12, lineHeight: 1.5, boxShadow: '0 4px 18px #0005' }}>
        <strong>Revoltz AgencyOS subscription</strong>
        <div style={{ margin: '4px 0 8px' }}>Continue to Razorpay to review the configured monthly plan and its price before you approve payment.</div>
        <button type="button" disabled={billingLoading} onClick={startSubscription} style={{ border: '1px solid #9c7bc0', borderRadius: 6, padding: '7px 10px', background: '#382546', color: '#fff', cursor: billingLoading ? 'wait' : 'pointer' }}>{billingLoading ? 'Opening secure checkout…' : billingStatus === 'created' || billingStatus === 'authenticated' || billingStatus === 'pending' ? 'Continue subscription checkout' : 'View monthly subscription'}</button>
        {billingError && <div role="alert" style={{ marginTop: 6 }}>{billingError}</div>}
      </div>}
      {billingStatus === 'active' && <div role="status" style={{ position: 'fixed', zIndex: 1099, top: 66, right: 12, padding: '7px 10px', border: '1px solid #375b48', borderRadius: 9, background: '#14221c', color: '#a9d9b8', fontSize: 12 }}>Subscription active</div>}
      <App />
    </>;
  }

  return (
    <div className="workspace-auth-page">
      <form className="workspace-auth-card" onSubmit={submit}>
        <div className="workspace-auth-mark">R</div>
        <div className="workspace-auth-eyebrow">REVOLTZ AI · AGENCYOS</div>
        <h1>{mode === 'register' ? 'Create your workspace' : 'Welcome back'}</h1>
        <p className="workspace-auth-description">{mode === 'register' ? 'Create a private account for your business profile, team, payroll and work records.' : 'Sign in to open your saved business workspace from any device.'}</p>
        {mode === 'register' && <label className="workspace-auth-field"><span>Your name</span><div><UserRound size={16} /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} placeholder="Your name" /></div></label>}
        <label className="workspace-auth-field"><span>Email address</span><div><Mail size={16} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" /></div></label>
        <label className="workspace-auth-field"><span>Password</span><div><LockKeyhole size={16} /><input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === 'register' ? 12 : 1} maxLength={128} placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'} /></div></label>
        {error && <div className="workspace-auth-error" role="alert">{error}</div>}
        <button className="workspace-auth-submit" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{submitting ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
        <button className="workspace-auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'register' ? 'Already have an account? Sign in' : 'New to AgencyOS? Create an account'}</button>
        <div className="workspace-auth-security"><ShieldCheck size={14} /> Your workspace is private to your account and saved to the cloud.</div>
      </form>
    </div>
  );
}

