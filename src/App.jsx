import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownUp, ArrowRight, ArrowUpRight, Award, BarChart3, Building2, CalendarDays, ClipboardList,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Copy, Download, ExternalLink, FileText, CircleDollarSign,
  Filter, Flame, Globe2, LayoutDashboard, LoaderCircle, Mail, MapPin, Menu, MessageCircle,
  MoreHorizontal, Phone, Plus, RefreshCw, Search, Send, Settings as SettingsIcon, ShieldCheck,
  SlidersHorizontal, Sparkles, Star, Target, Users, Upload, X, Zap, Info, History, Trash2, Tag,
} from 'lucide-react';
import { DEMO_LEADS, LEAD_STATUSES, SERVICES } from './data/demoLeads.js';
import { buildWorkflowCsv } from './lib/csv.js';
import { addDays, followUpPlan, formatDate, localDateString } from './lib/dates.js';
import { buildOutreach } from './lib/outreach.js';
import { getWebsiteAudit, opportunityReason, scoreOpportunity } from './lib/qualification.js';
import { initials, ScorePill, titleCaseStatus } from './components/leadPrimitives.jsx';
import { isAppPath, navigate, useRouterPath, withBase } from './lib/router.js';
import RevoltzSite from './site/RevoltzSite.jsx';
import BusinessAuditor from './components/BusinessAuditor.jsx';
import SalesEngine from './components/SalesEngine.jsx';
import DealTracker from './components/DealTracker.jsx';
import FollowUpAssistant from './components/FollowUpAssistant.jsx';
import ClientOnboarding from './components/ClientOnboarding.jsx';
import InvoiceTracker from './components/InvoiceTracker.jsx';
import ProjectTracker from './components/ProjectTracker.jsx';
import BusinessReports from './components/BusinessReports.jsx';
import DataBackup from './components/DataBackup.jsx';
import PageErrorBoundary from './components/PageErrorBoundary.jsx';
import { dedupeLeads, isFoodBusiness, recommendService, savedLeadPlaceholder, whyThisLead } from './lib/leadUtils.js';
import { GEMINI_KEY_STORAGE, searchGeminiLeads, testGeminiApiKey } from './lib/geminiLeadFinder.js';
import { enrichmentCrmPatch, markLeadContacted, updateCrmRecord, validateOutreachContact } from './lib/crm.js';
import { getOrCreateCachedRequest } from './lib/placeDetailsCache.js';
import {
  OSM_ATTRIBUTION, OSM_LICENSE_URL, buildFreeSearchPayload, freeSearchHint, isOsmLead, listingSourceNoun,
} from './lib/freeLeadFinder.js';
import {
  applyManualLeadOverride, applyManualLeadUpdate, createManualLead, findManualLeadDuplicate,
  manualLeadOverrideFields, manualLeadSourceLabel, parseManualLeadCsv, validateManualLead,
} from './lib/manualLeads.js';

const DEFAULT_CRM = { status: 'NEW', notes: '', lastContacted: '', lastContactedAt: '', followUpAnchorDate: '', followUpStep: 0, nextFollowUp: '', assignedService: 'Website', estimatedDealValue: '', email: '', emailVerifiedByUser: false, emailPermissionConfirmed: false, whatsappOptInConfirmed: false, enrichmentStatus: 'not_enriched', enrichmentTimestamp: '', enrichmentSource: '', enrichmentConfidence: '', enrichmentEmail: '', enrichmentPhone: '', enrichmentWhatsappUrl: '', enrichmentSocialLinks: [], enrichmentAddress: '', enrichmentBusinessName: '', enrichmentServices: [], enrichmentOpeningHours: '', enrichmentContactPage: '', discoveredWebsite: '', enrichmentEvidence: [], tags: [] };
const WORKFLOW_STORAGE_KEY = 'agencyos:workflow:v1';
const SAVED_PLACE_IDS_KEY = 'agencyos:saved-place-ids:v1';
const SEARCH_HISTORY_KEY = 'agencyos:search-history:v1';
const GEMINI_API_KEY_STORAGE = GEMINI_KEY_STORAGE;
const MANUAL_LEADS_STORAGE_KEY = 'agencyos:manual-leads:v1';
const MANUAL_OVERRIDES_STORAGE_KEY = 'agencyos:manual-lead-overrides:v1';
const EXAMPLE_SEARCHES = ['Restaurants in Pune', 'Dental clinics in Pune', 'CA firms in Pune', 'Gyms in Pune', 'Salons in Pune', 'Real estate agencies in Pune', 'Cloud kitchens in Pune'];
const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Find Leads', icon: Search },
  { label: 'AI Business Auditor', icon: ClipboardList },
  { label: 'Leads', icon: Users },
  { label: 'Campaigns', icon: Send },
  { label: 'Sales Engine', icon: Target },
  { label: 'Deal Pipeline', icon: Award },
  { label: 'Follow-up Assistant', icon: CalendarDays },
  { label: 'Client Onboarding', icon: ClipboardList },
  { label: 'Invoice Tracker', icon: CircleDollarSign },
  { label: 'Project Tracker', icon: CalendarDays },
  { label: 'Business Reports', icon: BarChart3 },
  { label: 'Data Backup', icon: ShieldCheck },
  { label: 'Settings', icon: SettingsIcon },
];

function readWorkflow() {
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value)));
  } catch { return {}; }
}
function readSavedPlaceIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_PLACE_IDS_KEY) || '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id) => typeof id === 'string' && id.length <= 300 && !id.startsWith('demo-')))].slice(0, 500) : [];
  } catch { return []; }
}
function readSearchHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.category === 'string' && typeof item.city === 'string')
      .slice(0, 8).map((item) => ({ category: item.category.slice(0, 100), city: item.city.slice(0, 160), radiusKm: String(item.radiusKm || '10'), maxResults: String(item.maxResults || '10') }));
  } catch { return []; }
}

function readManualLeads() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MANUAL_LEADS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record) => record?.source === 'manual' && typeof record.id === 'string' && record.id.length <= 256)
      .slice(0, 1000).map((record) => {
        const validation = validateManualLead({
          ...record,
          email: record.initialCRM?.email ?? record.email,
          notes: record.initialCRM?.notes ?? record.notes,
        });
        if (!validation.valid) return null;
        const lead = createManualLead(validation.values, { id: record.id });
        lead.initialCRM = cleanCrmRecord({
          ...lead.initialCRM,
          ...(record.initialCRM || {}),
          ...(validation.values.email ? { email: validation.values.email } : {}),
          ...(validation.values.notes ? { notes: validation.values.notes } : {}),
        });
        return lead;
      }).filter(Boolean);
  } catch { return []; }
}
function readManualLeadOverrides() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MANUAL_OVERRIDES_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const allowed = ['name', 'category', 'city', 'website', 'phone', 'mapsUrl', 'address', 'rating', 'reviews', 'instagram', 'facebook'];
    return Object.fromEntries(Object.entries(parsed).filter(([id, patch]) => id && id.length <= 300 && patch && typeof patch === 'object' && !Array.isArray(patch))
      .map(([id, patch]) => [id, Object.fromEntries(allowed.filter((field) => typeof patch[field] === 'string' || Number.isFinite(patch[field])).map((field) => [field, patch[field]]))])
      .filter(([, patch]) => Object.keys(patch).length));
  } catch { return {}; }
}

function cleanCrmRecord(record) {
  const next = { ...DEFAULT_CRM, ...(record || {}) };
  return {
    status: LEAD_STATUSES.includes(next.status) ? next.status : 'NEW',
    notes: typeof next.notes === 'string' ? next.notes.slice(0, 5000) : '',
    lastContacted: typeof next.lastContacted === 'string' ? next.lastContacted.slice(0, 10) : '',
    lastContactedAt: typeof next.lastContactedAt === 'string' ? next.lastContactedAt.slice(0, 40) : '',
    followUpAnchorDate: typeof next.followUpAnchorDate === 'string' ? next.followUpAnchorDate.slice(0, 10) : '',
    followUpStep: Math.max(0, Math.min(4, Number.parseInt(next.followUpStep, 10) || 0)),
    nextFollowUp: typeof next.nextFollowUp === 'string' ? next.nextFollowUp.slice(0, 10) : '',
    assignedService: SERVICES.includes(next.assignedService) ? next.assignedService : 'Website',
    estimatedDealValue: next.estimatedDealValue === '' || next.estimatedDealValue == null ? '' : String(next.estimatedDealValue).slice(0, 14),
    email: typeof next.email === 'string' ? next.email.slice(0, 254) : '',
    emailVerifiedByUser: Boolean(next.emailVerifiedByUser),
    emailPermissionConfirmed: Boolean(next.emailPermissionConfirmed),
    whatsappOptInConfirmed: Boolean(next.whatsappOptInConfirmed),
    enrichmentStatus: typeof next.enrichmentStatus === 'string' ? next.enrichmentStatus.slice(0, 40) : 'not_enriched',
    enrichmentTimestamp: typeof next.enrichmentTimestamp === 'string' ? next.enrichmentTimestamp.slice(0, 40) : '',
    enrichmentSource: typeof next.enrichmentSource === 'string' ? next.enrichmentSource.slice(0, 80) : '',
    enrichmentConfidence: ['high', 'medium', 'low'].includes(next.enrichmentConfidence) ? next.enrichmentConfidence : '',
    enrichmentEmail: typeof next.enrichmentEmail === 'string' ? next.enrichmentEmail.slice(0, 254) : '',
    enrichmentPhone: typeof next.enrichmentPhone === 'string' ? next.enrichmentPhone.slice(0, 80) : '',
    enrichmentWhatsappUrl: typeof next.enrichmentWhatsappUrl === 'string' ? next.enrichmentWhatsappUrl.slice(0, 2000) : '',
    enrichmentSocialLinks: [...new Set((Array.isArray(next.enrichmentSocialLinks) ? next.enrichmentSocialLinks : []).filter((value) => typeof value === 'string').map((value) => value.slice(0, 2000)).filter(Boolean))].slice(0, 8),
    enrichmentAddress: typeof next.enrichmentAddress === 'string' ? next.enrichmentAddress.slice(0, 300) : '',
    enrichmentBusinessName: typeof next.enrichmentBusinessName === 'string' ? next.enrichmentBusinessName.slice(0, 160) : '',
    enrichmentServices: [...new Set((Array.isArray(next.enrichmentServices) ? next.enrichmentServices : []).filter((value) => typeof value === 'string').map((value) => value.trim().slice(0, 120)).filter(Boolean))].slice(0, 12),
    enrichmentOpeningHours: typeof next.enrichmentOpeningHours === 'string' ? next.enrichmentOpeningHours.slice(0, 300) : '',
    enrichmentContactPage: typeof next.enrichmentContactPage === 'string' ? next.enrichmentContactPage.slice(0, 2000) : '',
    discoveredWebsite: typeof next.discoveredWebsite === 'string' ? next.discoveredWebsite.slice(0, 2000) : '',
    enrichmentEvidence: (Array.isArray(next.enrichmentEvidence) ? next.enrichmentEvidence : []).slice(0, 40).filter((item) => item && typeof item === 'object' && typeof item.field === 'string' && typeof item.value === 'string').map((item) => ({ field: item.field.slice(0, 40), value: item.value.slice(0, 240), source: typeof item.source === 'string' ? item.source.slice(0, 160) : '', evidence: typeof item.evidence === 'string' ? item.evidence.slice(0, 240) : '', confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'low' })),
    tags: [...new Set((Array.isArray(next.tags) ? next.tags : []).map((tag) => String(tag).trim().slice(0, 40)).filter(Boolean))].slice(0, 20),
  };
}

function normalizeSearch(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function demoSearch(category, city) {
  const categoryText = normalizeSearch(category);
  const cityText = normalizeSearch(city);
  const stopWords = new Set(['in', 'near', 'the', 'and', 'business', 'businesses', 'local', 'agency', 'agencies']);
  const tokens = categoryText.split(' ').filter((word) => word && !stopWords.has(word)).map((word) => word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word);
  const aliases = { dentist: ['dental'], accountant: ['ca'], fitness: ['gym'], beauty: ['salon'] };
  const requested = tokens.flatMap((token) => aliases[token] || [token]);
  return DEMO_LEADS.filter((lead) => {
    const text = normalizeSearch(`${lead.category} ${lead.name}`);
    const leadCity = normalizeSearch(`${lead.city} ${lead.address}`);
    const cityMatch = !cityText || leadCity.includes(cityText) || cityText.split(' ').every((part) => leadCity.includes(part));
    return cityMatch && (!requested.length || requested.some((token) => text.includes(token)));
  });
}
function getLeadKey(lead) { return lead?.placeId || lead?.id; }
function safePhoneDigits(phone) {
  const raw = String(phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');

  // Normalize common Indian business-number formats:
  // 10 digits: 9876543210 -> 9876543210
  // 11 digits with trunk 0: 09876543210 -> 9876543210
  // 12 digits with country code: 919876543210 -> 919876543210
  // +91 formats are handled after punctuation is stripped.
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  if (/^0[6-9]\d{9}$/.test(digits)) return digits.slice(1);
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  
  // Keep valid non-Indian international numbers (8–15 digits).
  const normalizedInternational = raw.replace(/[\s().-]/g, '');
  if (/^\+?[1-9]\d{7,14}$/.test(normalizedInternational)) return digits;

  return '';
}
function safeHttpUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
function getDefaultCrm(lead) { return cleanCrmRecord({ ...DEFAULT_CRM, ...(lead?.initialCRM || {}) }); }

function AgencyOSApp() {
  const [activePage, setActivePage] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState({ loading: true, googlePlacesConfigured: false, freeSearchEnabled: true, reachable: true });
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try { return window.sessionStorage.getItem(GEMINI_API_KEY_STORAGE) || ''; } catch { return ''; }
  });
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [manualLeads, setManualLeads] = useState(readManualLeads);
  const [manualOverrides, setManualOverrides] = useState(readManualLeadOverrides);
  const [leads, setLeads] = useState(() => dedupeLeads(manualLeads.map((lead) => applyManualLeadOverride(lead, manualOverrides))));
  const [workflow, setWorkflow] = useState(readWorkflow);
  const [savedPlaceIds, setSavedPlaceIds] = useState(readSavedPlaceIds);
  const [searchHistory, setSearchHistory] = useState(readSearchHistory);
  const [finderResults, setFinderResults] = useState([]);
  const [finderSource, setFinderSource] = useState('gemini');
  const [finderWarnings, setFinderWarnings] = useState([]);
  const [finderQuery, setFinderQuery] = useState('');
  const [finderRequests, setFinderRequests] = useState(0);
  const [finderGeocodingRequests, setFinderGeocodingRequests] = useState(0);
  const [refreshingDetailsIds, setRefreshingDetailsIds] = useState({});
  const [searchForm, setSearchForm] = useState({ category: '', city: 'Pune', radiusKm: '10', maxResults: '10', source: 'gemini' });
  const [osmMeta, setOsmMeta] = useState({ queriedTags: [], matchedCategory: '', resolvedLocation: '' });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState('score');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [outreachLeadId, setOutreachLeadId] = useState('');
  const [auditLoadingIds, setAuditLoadingIds] = useState({});
  const [auditRevealedIds, setAuditRevealedIds] = useState({});
  const [enrichmentLoadingIds, setEnrichmentLoadingIds] = useState({});
  const [toast, setToast] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');
  const initialConfigLoaded = useRef(false);
  const toastTimer = useRef(null);
  const detailsRequestsRef = useRef(new Map());

  const getCrm = (lead) => cleanCrmRecord({ ...getDefaultCrm(lead), ...(workflow[getLeadKey(lead)] || {}) });
  const allLeads = useMemo(() => dedupeLeads([...leads, ...finderResults]), [leads, finderResults]);
  const selectedLead = selectedLeadId ? allLeads.find((lead) => getLeadKey(lead) === selectedLeadId) : null;
  const outreachLead = outreachLeadId ? allLeads.find((lead) => getLeadKey(lead) === outreachLeadId) : null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/api/config', { cache: 'no-store' });
        const data = await response.json();
        if (!alive) return;
        setApiConfig({ loading: false, reachable: true, ...data });
        if (!initialConfigLoaded.current) {
          initialConfigLoaded.current = true;
          // Gemini is the primary lead source; Google Places is retained only for legacy saved-place refresh.
          setSearchForm((current) => ({ ...current, source: 'gemini' }));
          const savedReferences = savedPlaceIds.map((id) => savedLeadPlaceholder(id));
          setLeads((current) => {
            const retained = current.filter((lead) => !lead.demo);
            const retainedManual = [...manualLeads, ...retained.filter((lead) => lead.source === 'manual')];
            return dedupeLeads([...savedReferences, ...retained, ...retainedManual].map((lead) => applyManualLeadOverride(lead, manualOverrides)));
          });
        }
      } catch {
        if (!alive) return;
        setApiConfig({ loading: false, reachable: false, googlePlacesConfigured: false, freeSearchEnabled: true });
        if (!initialConfigLoaded.current) {
          initialConfigLoaded.current = true;
          setSearchForm((current) => ({ ...current, source: 'gemini' }));
          setLeads((current) => dedupeLeads([...manualLeads, ...current.filter((lead) => lead.source === 'manual')].map((lead) => applyManualLeadOverride(lead, manualOverrides))));
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    try {
      const clean = Object.fromEntries(Object.entries(workflow).map(([key, value]) => [key, cleanCrmRecord(value)]));
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(clean));
    } catch { /* Storage can be unavailable or full; the active session remains usable. */ }
  }, [workflow]);
  useEffect(() => {
    try { window.localStorage.setItem(SAVED_PLACE_IDS_KEY, JSON.stringify(savedPlaceIds)); }
    catch { /* Saved references remain usable in this tab if storage is unavailable. */ }
  }, [savedPlaceIds]);
  useEffect(() => {
    try { window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory.slice(0, 8))); }
    catch { /* Search history is optional and contains user-entered terms only. */ }
  }, [searchHistory]);
  useEffect(() => {
    try { window.localStorage.setItem(MANUAL_LEADS_STORAGE_KEY, JSON.stringify(manualLeads.slice(0, 1000))); }
    catch { /* Manual leads remain usable in the current app session if storage is unavailable or full. */ }
  }, [manualLeads]);
  useEffect(() => {
    try { window.localStorage.setItem(MANUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(manualOverrides)); }
    catch { /* Only explicitly user-entered overrides are stored; the active session remains usable. */ }
  }, [manualOverrides]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }
  function updateCrm(lead, patch) {
    const key = getLeadKey(lead);
    if (!key) return;
    setWorkflow((previous) => {
      const current = cleanCrmRecord({ ...getDefaultCrm(lead), ...(previous[key] || {}) });
      const emailChanged = Object.hasOwn(patch || {}, 'email') && patch.email !== current.email;
      const next = updateCrmRecord(current, {
        ...(emailChanged ? { emailVerifiedByUser: false, emailPermissionConfirmed: false } : {}),
        ...(patch || {}),
      });
      return { ...previous, [key]: cleanCrmRecord(next) };
    });
  }
  function updateCrmBulk(ids, patch) {
    if (!ids.length || !Object.keys(patch).length) return;
    const { addTag, ...commonPatch } = patch;
    setWorkflow((previous) => {
      const next = { ...previous };
      for (const id of ids) {
        const lead = allLeads.find((item) => getLeadKey(item) === id);
        const current = cleanCrmRecord({ ...getDefaultCrm(lead), ...(next[id] || {}) });
        const tags = addTag ? [...current.tags, String(addTag).trim()].filter(Boolean) : current.tags;
        next[id] = cleanCrmRecord(updateCrmRecord(current, { ...commonPatch, tags }));
      }
      return next;
    });
    showToast(`CRM updated for ${ids.length} selected ${ids.length === 1 ? 'lead' : 'leads'}.`);
  }
  function markContacted(lead) {
    updateCrm(lead, markLeadContacted(getCrm(lead)));
    showToast('Contacted timestamp recorded; Day 3 follow-up suggested. No message was sent.');
  }
  function updateStatus(lead, status) {
    updateCrm(lead, { status });
    showToast(status === 'DO NOT CONTACT' ? 'Contact actions disabled for this lead.' : `Status updated to ${titleCaseStatus(status)}.`);
  }
  async function refreshConfig() {
    setSettingsNotice('');
    setApiConfig((current) => ({ ...current, loading: true }));
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      const data = await response.json();
      setApiConfig({ loading: false, reachable: true, ...data });
      setSearchForm((current) => ({ ...current, source: data.googlePlacesConfigured ? 'google' : 'osm' }));
      const savedReferences = savedPlaceIds.map((id) => savedLeadPlaceholder(id));
      setLeads((current) => {
        const retained = current.filter((lead) => !lead.demo && !lead.needsRefresh);
        const manual = [...manualLeads, ...retained.filter((lead) => lead.source === 'manual')];
        const liveLeads = retained.filter((lead) => lead.source !== 'manual');
        return dedupeLeads([...liveLeads, ...savedReferences, ...manual].map((lead) => applyManualLeadOverride(lead, manualOverrides)));
      });
      setSettingsNotice('Configuration status refreshed.');
    } catch {
      setApiConfig((current) => ({ ...current, loading: false, reachable: false }));
      setSettingsNotice('Could not reach the AgencyOS server.');
    }
  }
  async function runLeadSearch() {
    const category = searchForm.category.trim();
    const city = searchForm.city.trim();
    if (!category || !city) { setSearchError('Enter an industry/category and a city or location.'); return; }
    const query = { category, city, radiusKm: String(searchForm.radiusKm || '10'), maxResults: String(searchForm.maxResults || '10') };
    setSearchHistory((current) => [query, ...current.filter((item) => normalizeSearch(`${item.category} ${item.city}`) !== normalizeSearch(`${category} ${city}`))].slice(0, 8));
    setSearchError(''); setFinderWarnings([]); setFinderResults([]); setFinderRequests(0); setFinderGeocodingRequests(0); setSearchHasRun(true); setFinderQuery(`${category} in ${city}`); setSearching(true);
    setOsmMeta({ queriedTags: [], matchedCategory: '', resolvedLocation: '' });
    try {
      if (searchForm.source === 'demo') {
        const results = demoSearch(category, city).slice(0, Number(searchForm.maxResults) || 10);
        setFinderResults(dedupeLeads(results).map((lead) => applyManualLeadOverride(lead, manualOverrides)));
        setFinderSource('demo');
        setFinderWarnings(['The sample set contains fictional Pune businesses only. Search radius is illustrative for these sample records.']);
        setFinderRequests(0);
        setFinderGeocodingRequests(0);
        if (!results.length) showToast('No sample matches found. Try another category.');
      } else {
        if (!geminiApiKey.trim()) throw new Error('Add your Gemini API key in Settings first, then test it and search again.');
        const result = await searchGeminiLeads({
          apiKey: geminiApiKey,
          category,
          location: city,
          radiusKm: Number(searchForm.radiusKm),
          maxResults: Number(searchForm.maxResults),
        });
        const results = result.leads || [];
        setFinderResults(dedupeLeads(results).map((lead) => applyManualLeadOverride(lead, manualOverrides)));
        setFinderWarnings(results.length ? ['Results are grounded with Google Maps when available. Verify contact details and current business status before outreach.'] : ['Gemini returned no matching grounded businesses. Try a broader category or nearby city.']);
        setFinderRequests(1);
        setFinderGeocodingRequests(0);
        setFinderSource('gemini');
        if (!results.length) showToast('No grounded matches found. Try a broader category or larger radius.');
      }
    } catch (error) { setSearchError(error.message || 'Search failed. Please try again.'); }
    finally { setSearching(false); }
  }
  function addLeadToWorkspace(lead) {
    const key = getLeadKey(lead);
    if (!key) return;
    const existing = leads.find((item) => getLeadKey(item) === key);
    setLeads((current) => {
      const index = current.findIndex((item) => getLeadKey(item) === key);
      if (index < 0) return [lead, ...current];
      const next = [...current];
      next[index] = { ...next[index], ...lead, needsRefresh: false };
      return next;
    });
    if (lead.source === 'google' && !String(key).startsWith('demo-')) setSavedPlaceIds((current) => [...new Set([key, ...current])].slice(0, 500));
    showToast(existing?.needsRefresh ? 'Saved place details refreshed from this search.' : existing ? 'This lead is already in your workspace.' : 'Lead saved to your workspace.');
  }
  function addManualLeadEntries(entries, mode = 'add') {
    const working = [...allLeads];
    const added = [];
    const updates = new Map();
    const overridePatches = new Map();
    const crmPatches = new Map();
    for (const entry of entries) {
      const input = entry?.values || entry?.input || entry;
      const validation = validateManualLead(input);
      if (!validation.valid) continue;
      const values = validation.values;
      const duplicate = findManualLeadDuplicate(values, working);
      if (duplicate && mode === 'update' && duplicate.lead?.source !== 'demo') {
        const key = duplicate.leadId;
        const current = working.find((lead) => getLeadKey(lead) === key) || duplicate.lead;
        const updated = applyManualLeadUpdate(current, values);
        updates.set(key, updated);
        if (updated.source !== 'manual') {
          overridePatches.set(key, { ...(overridePatches.get(key) || {}), ...manualLeadOverrideFields(values) });
        }
        const crmPatch = {};
        if (values.email) crmPatch.email = values.email;
        if (values.notes) crmPatch.notes = values.notes;
        if (values.phone && values.phone.trim() !== String(current.phone || '').trim()) crmPatch.whatsappOptInConfirmed = false;
        if (Object.keys(crmPatch).length) crmPatches.set(key, { lead: updated, patch: crmPatch });
        const index = working.findIndex((lead) => getLeadKey(lead) === key);
        if (index >= 0) working[index] = updated;
      } else {
        const lead = createManualLead(values);
        added.push(lead);
        working.unshift(lead);
      }
    }

    const finalAdded = added.map((lead) => updates.get(getLeadKey(lead)) || lead);
    const updatedLeads = [...updates.values()];
    const manualRecords = [...finalAdded, ...updatedLeads.filter((lead) => lead.source === 'manual')];
    if (manualRecords.length) {
      setManualLeads((current) => {
        const byId = new Map(current.map((lead) => [getLeadKey(lead), lead]));
        for (const lead of manualRecords) byId.set(getLeadKey(lead), lead);
        return [...byId.values()].slice(-1000);
      });
    }
    if (finalAdded.length || updatedLeads.length) {
      setLeads((current) => {
        const next = current.map((lead) => updates.get(getLeadKey(lead)) || lead);
        for (const lead of updatedLeads) {
          if (!next.some((item) => getLeadKey(item) === getLeadKey(lead))) next.unshift(lead);
        }
        return dedupeLeads([...finalAdded, ...next]);
      });
      setFinderResults((current) => current.map((lead) => updates.get(getLeadKey(lead)) || lead));
    }
    if (overridePatches.size) {
      setManualOverrides((current) => {
        const next = { ...current };
        for (const [key, patch] of overridePatches) next[key] = { ...(next[key] || {}), ...patch };
        return next;
      });
    }
    if (crmPatches.size) {
      for (const { lead, patch } of crmPatches.values()) updateCrm(lead, patch);
    }
    const googleIds = updatedLeads.filter((lead) => lead.source === 'google' && !lead.needsRefresh).map((lead) => getLeadKey(lead));
    if (googleIds.length) setSavedPlaceIds((current) => [...new Set([...googleIds, ...current])].slice(0, 500));
    const updatedCount = [...updates.values()].length;
    showToast(`${finalAdded.length} manual ${finalAdded.length === 1 ? 'lead added' : 'leads added'}${updatedCount ? `; ${updatedCount} existing ${updatedCount === 1 ? 'lead updated' : 'leads updated'}` : ''}. No Google Places search was made.`);
  }

  function removeSavedLeads(ids) {
    const keys = new Set(ids);
    if (!keys.size) return;
    setLeads((current) => current.filter((item) => !keys.has(getLeadKey(item))));
    setFinderResults((current) => current.filter((item) => !keys.has(getLeadKey(item))));
    setManualLeads((current) => current.filter((item) => !keys.has(getLeadKey(item))));
    setSavedPlaceIds((current) => current.filter((id) => !keys.has(id)));
    setManualOverrides((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !keys.has(id))));
    setWorkflow((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !keys.has(id))));
    setSelectedLeadId((current) => keys.has(current) ? '' : current);
    setOutreachLeadId((current) => keys.has(current) ? '' : current);
    showToast(`${keys.size} ${keys.size === 1 ? 'lead' : 'leads'} deleted from your workspace.`);
  }

  function removeSavedLead(lead) {
    const key = getLeadKey(lead);
    if (!key) return;
    const confirmed = window.confirm(`Delete "${lead.name}" from your leads? This removes its saved CRM details from this browser.`);
    if (!confirmed) return;
    setLeads((current) => current.filter((item) => getLeadKey(item) !== key));
    setFinderResults((current) => current.filter((item) => getLeadKey(item) !== key));
    if (lead.source === 'manual') setManualLeads((current) => current.filter((item) => getLeadKey(item) !== key));
    if (lead.source === 'google') setSavedPlaceIds((current) => current.filter((id) => id !== key));
    setManualOverrides((current) => { const next = { ...current }; delete next[key]; return next; });
    setWorkflow((current) => { const next = { ...current }; delete next[key]; return next; });
    setSelectedLeadId((current) => current === key ? '' : current);
    showToast('Lead removed from your workspace.');
  }
  async function refreshSavedPlace(lead) {
    const key = getLeadKey(lead);
    if (isOsmLead(lead)) {
      showToast('OpenStreetMap records already carry their full details when found; there is nothing to refresh.');
      return;
    }
    if (!key || lead.demo || !apiConfig.googlePlacesConfigured) {
      showToast(apiConfig.googlePlacesConfigured ? 'Demo sample records cannot be refreshed.' : 'Google Places is not configured; saved place IDs need a server-side Places key to refresh.');
      return;
    }
    setRefreshingDetailsIds((current) => ({ ...current, [key]: true }));
    try {
      const request = getOrCreateCachedRequest(detailsRequestsRef.current, key, async () => {
        const response = await fetch('/api/places/details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: key }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Saved place refresh failed.');
        return data.result;
      });
      const refreshed = await request;
      const result = { ...refreshed, source: 'google', demo: false, needsRefresh: false };
      const mergeDetails = (item) => applyManualLeadOverride({
        ...item, ...result,
        category: result.category || (item.needsRefresh ? '' : item.category),
        city: result.city || item.city,
        address: result.address || item.address,
        phone: result.phone || item.phone,
        internationalPhoneNumber: result.internationalPhoneNumber || item.internationalPhoneNumber,
        website: result.website || item.website,
        rating: result.rating ?? item.rating,
        reviews: result.reviews || item.reviews,
        mapsUrl: result.mapsUrl || item.mapsUrl,
        businessStatus: result.businessStatus === 'UNKNOWN' ? item.businessStatus : result.businessStatus,
        needsRefresh: false,
      }, manualOverrides);
      setLeads((current) => current.map((item) => getLeadKey(item) === key ? mergeDetails(item) : item));
      setFinderResults((current) => current.map((item) => getLeadKey(item) === key ? mergeDetails(item) : item));
      showToast('Saved place details refreshed for this session. Google listing content is not stored locally.');
    } catch (error) { showToast(error.message || 'Saved place refresh failed.'); }
    finally { setRefreshingDetailsIds((current) => ({ ...current, [key]: false })); }
  }
  function openLead(lead) { setSelectedLeadId(getLeadKey(lead)); }
  async function analyzeWebsite(lead) {
    if (!lead.website) return;
    const key = getLeadKey(lead);
    setAuditLoadingIds((current) => ({ ...current, [key]: true }));
    try {
      let audit;
      if (lead.demo) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        audit = lead.demoAudit || null;
        if (!audit) throw new Error('No illustrative website signals are included for this sample lead.');
        setAuditRevealedIds((current) => ({ ...current, [key]: true }));
      } else {
        const response = await fetch('/api/website/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ website: lead.website }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Website analysis failed.');
        audit = data.audit;
        setLeads((current) => current.map((item) => getLeadKey(item) === key ? { ...item, websiteAudit: audit } : item));
        setFinderResults((current) => current.map((item) => getLeadKey(item) === key ? { ...item, websiteAudit: audit } : item));
      }
      if (audit) showToast(lead.demo ? 'Demo website signals loaded. These are illustrative, not a live audit.' : 'Website source check completed. Review its limitations before outreach.');
    } catch (error) { showToast(error.message || 'Website analysis failed.'); }
    finally { setAuditLoadingIds((current) => ({ ...current, [key]: false })); }
  }
  async function enrichLead(lead) {
    if (!isOsmLead(lead)) return;
    const key = getLeadKey(lead);
    setEnrichmentLoadingIds((current) => ({ ...current, [key]: true }));
    try {
      const response = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: {
          id: lead.id, placeId: lead.placeId, source: lead.source, name: lead.name,
          category: lead.category, city: lead.city, website: lead.website,
        } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lead enrichment failed.');
      const result = data.result;
      if (!result) throw new Error('The enrichment response was incomplete.');
      updateCrm(lead, enrichmentCrmPatch(result));
      if (result.status === 'complete') showToast(data.cached ? 'Showing the saved enrichment result (cached for 24 hours).' : 'Public business details enriched. Review the evidence and verify contacts before use.');
      else showToast(result.message || 'No additional public business details were found.');
    } catch (error) { showToast(error.message || 'Lead enrichment failed.'); }
    finally { setEnrichmentLoadingIds((current) => ({ ...current, [key]: false })); }
  }
  function exportCsv(records = leads) {
    const csv = buildWorkflowCsv(records, getCrm);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = `agencyos-workflow-${localDateString()}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(href);
    showToast('CRM CSV exported. Manual lead details and workflow fields are included; Google Places listing content is excluded.');
  }

  const filteredLeads = useMemo(() => {
    const query = normalizeSearch(leadSearch);
    return leads.filter((lead) => {
      const crm = getCrm(lead);
      const haystack = normalizeSearch(`${lead.name} ${lead.category} ${lead.city} ${lead.address} ${crm.email}`);
      return (!query || haystack.includes(query)) && (statusFilter === 'ALL' || crm.status === statusFilter) && (priorityFilter === 'ALL' || scoreOpportunity(lead).tier === ({ HOT: 'high', WARM: 'medium', COLD: 'low' }[priorityFilter] || priorityFilter.toLowerCase()));
    });
  }, [leads, workflow, leadSearch, statusFilter, priorityFilter]);
  const sortedLeads = useMemo(() => {
    const items = [...filteredLeads];
    items.sort((left, right) => {
      let a; let b;
      if (sortKey === 'score') { a = scoreOpportunity(left).score; b = scoreOpportunity(right).score; }
      else if (sortKey === 'rating') { a = Number(left.rating) || 0; b = Number(right.rating) || 0; }
      else if (sortKey === 'reviews') { a = Number(left.reviews) || 0; b = Number(right.reviews) || 0; }
      else if (sortKey === 'status') { a = getCrm(left).status; b = getCrm(right).status; }
      else { a = String(left.name || ''); b = String(right.name || ''); }
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return sortDirection === 'asc' ? result : -result;
    });
    return items;
  }, [filteredLeads, sortKey, sortDirection, workflow]);
  function handleSort(key) {
    if (sortKey === key) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection(key === 'name' || key === 'status' ? 'asc' : 'desc'); }
  }
  const handleOpenPitch = (lead) => {
    // Keep the pitch composer and lead drawer mutually exclusive.
    setSelectedLeadId('');
    setOutreachLeadId(getLeadKey(lead));
  };

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (outreachLeadId) {
        setOutreachLeadId('');
        return;
      }
      if (selectedLeadId) setSelectedLeadId('');
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [outreachLeadId, selectedLeadId]);

  return (
    <div className="app-shell">
      {sidebarOpen && <button type="button" className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <Sidebar activePage={activePage} onNavigate={(page) => { setActivePage(page); setSidebarOpen(false); }} open={sidebarOpen} />
      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
          <div className="topbar-context"><span className="topbar-kicker">WORKSPACE</span><span className="topbar-separator">/</span><span className="topbar-page">{activePage}</span></div>
          <div className="topbar-actions"><span className={`environment-pill ${apiConfig.googlePlacesConfigured || apiConfig.freeSearchEnabled ? 'is-connected' : ''}`}><span className="status-dot" />{apiConfig.loading ? 'Checking setup' : apiConfig.googlePlacesConfigured ? 'Places configured' : apiConfig.freeSearchEnabled ? 'OpenStreetMap available' : apiConfig.reachable ? 'Manual entry available' : 'Server unavailable'}</span><button className="icon-button help-button" title="Privacy-first by design" aria-label="Privacy-first by design" onClick={() => setActivePage('Privacy Policy')}><CircleHelp size={18} /></button><div className="user-avatar" aria-label="AgencyOS workspace">A</div></div>
        </header>
        <main className="main-content">

          {activePage === 'Dashboard' && <DashboardPage leads={leads} getCrm={getCrm} onNavigate={setActivePage} onOpenLead={openLead} onExport={() => exportCsv(leads)} />}
          {activePage === 'AI Business Auditor' && <BusinessAuditor apiKey={geminiApiKey} />}
          {activePage === 'Sales Engine' && <SalesEngine leads={leads} getCrm={getCrm} apiKey={geminiApiKey} />}
          {activePage === 'Deal Pipeline' && <DealTracker />}
          {activePage === 'Follow-up Assistant' && <FollowUpAssistant />}
          {activePage === 'Client Onboarding' && <ClientOnboarding />}
          {activePage === 'Invoice Tracker' && <InvoiceTracker />}
          {activePage === 'Project Tracker' && <ProjectTracker />}
          {activePage === 'Business Reports' && <BusinessReports />}
          {activePage === 'Data Backup' && <DataBackup />}
          {activePage === 'Find Leads' && <FinderPage searchForm={searchForm} setSearchForm={setSearchForm} onSearch={runLeadSearch} searching={searching} searchError={searchError} results={finderResults} source={finderSource} warnings={finderWarnings} requests={finderRequests} geocodingRequests={finderGeocodingRequests} history={searchHistory} onSelectHistory={(entry) => setSearchForm((current) => ({ ...current, ...entry }))} hasRun={searchHasRun} query={finderQuery} configLoading={apiConfig.loading} leads={leads} onAdd={addLeadToWorkspace} onOpenLead={openLead} onManualEntries={addManualLeadEntries} config={apiConfig} osmMeta={osmMeta} />}
          {activePage === 'Leads' && <PageErrorBoundary><LeadsPage leads={sortedLeads} allCount={leads.length} getCrm={getCrm} search={leadSearch} setSearch={setLeadSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onOpenLead={openLead} onPitch={handleOpenPitch} onStatus={updateStatus} onBulkUpdate={updateCrmBulk} onBulkRemove={removeSavedLeads} onRemove={removeSavedLead} onRefreshDetails={refreshSavedPlace} refreshingDetailsIds={refreshingDetailsIds} onExport={() => exportCsv(leads)} onFind={() => setActivePage('Find Leads')} /></PageErrorBoundary>}
          {activePage === 'Campaigns' && <CampaignsPage leads={leads} getCrm={getCrm} onOpenLead={openLead} onPitch={handleOpenPitch} />}
          {activePage === 'Settings' && <SettingsPage config={apiConfig} notice={settingsNotice} onRefresh={refreshConfig} onNavigate={setActivePage} geminiApiKey={geminiApiKey} onGeminiApiKeyChange={(value) => {
            setGeminiApiKey(value);
            try { window.sessionStorage.setItem(GEMINI_API_KEY_STORAGE, value); } catch {}
          }} geminiTesting={geminiTesting} onTestGemini={async () => {
            setGeminiTesting(true);
            setSettingsNotice('');
            try {
              await testGeminiApiKey(geminiApiKey);
              setSettingsNotice('Gemini API key works. Google Maps grounding is ready.');
            } catch (error) {
              setSettingsNotice(error?.message || 'Gemini API key test failed.');
            } finally { setGeminiTesting(false); }
          }} />}
          {activePage === 'Privacy Policy' && <LegalPage type="privacy" onNavigate={setActivePage} />}
          {activePage === 'Terms' && <LegalPage type="terms" onNavigate={setActivePage} />}
        </main>
        <footer className="app-footer"><span>AgencyOS <i>·</i> Evidence-led prospecting</span><div><a className="footer-site-link" href={withBase('/')} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); navigate('/'); }}>REVOLTZ AI</a><button type="button" onClick={() => setActivePage('Privacy Policy')}>Privacy</button><button type="button" onClick={() => setActivePage('Terms')}>Terms</button><span className="footer-version">V1.0</span></div></footer>
      </div>
      {selectedLead && <LeadDrawer key={getLeadKey(selectedLead)} lead={selectedLead} crm={getCrm(selectedLead)} onClose={() => setSelectedLeadId('')} onUpdate={(patch) => updateCrm(selectedLead, patch)} onStatus={(status) => updateStatus(selectedLead, status)} onMarkContacted={() => markContacted(selectedLead)} onRemove={() => removeSavedLead(selectedLead)} onRefreshPlace={() => refreshSavedPlace(selectedLead)} refreshingPlace={Boolean(refreshingDetailsIds[getLeadKey(selectedLead)])} onAnalyze={() => analyzeWebsite(selectedLead)} analyzing={Boolean(auditLoadingIds[getLeadKey(selectedLead)])} auditRevealed={Boolean(auditRevealedIds[getLeadKey(selectedLead)])} onEnrich={() => enrichLead(selectedLead)} enriching={Boolean(enrichmentLoadingIds[getLeadKey(selectedLead)])} onPitch={() => handleOpenPitch(selectedLead)} />}
      {outreachLead && <OutreachModal key={getLeadKey(outreachLead)} lead={outreachLead} crm={getCrm(outreachLead)} onClose={() => setOutreachLeadId('')} onToast={showToast} onMarkContacted={() => markContacted(outreachLead)} onReviewLead={() => { setOutreachLeadId(''); setSelectedLeadId(getLeadKey(outreachLead)); }} />}
      {toast && <div className="toast-message" role="status"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function Sidebar({ activePage, onNavigate, open }) {
  return <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
    <div className="brand-lockup"><div className="brand-mark"><Sparkles size={20} strokeWidth={1.8} /></div><div><span className="brand-name">Agency<span>OS</span></span><span className="brand-caption">GROW WITH CLARITY</span></div></div>
    <div className="workspace-switcher"><div className="workspace-monogram">AR</div><div className="workspace-label"><strong>Agency workspace</strong><span>Starter plan</span></div><ChevronDown size={15} /></div>
    <div className="nav-section-label">WORKSPACE</div><nav className="main-nav" aria-label="Main navigation">{NAV_ITEMS.map(({ label, icon: Icon }) => <button type="button" key={label} onClick={() => onNavigate(label)} className={`nav-item ${activePage === label ? 'nav-item-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Leads' && <span className="nav-count">•</span>}</button>)}</nav>
    <div className="sidebar-spacer" /><div className="sidebar-assist-card"><div className="assist-icon"><Zap size={16} /></div><div><strong>Thoughtful outreach</strong><p>Every message stays yours to review and send.</p></div></div>
    <div className="sidebar-bottom"><div className="sidebar-privacy"><ShieldCheck size={14} /> Your data stays in your workspace</div><div className="sidebar-user-row"><div className="sidebar-user-avatar">A</div><div className="sidebar-user-copy"><strong>Agency admin</strong><span>Workspace owner</span></div><MoreHorizontal size={18} /></div></div>
  </aside>;
}
function PageHeading({ eyebrow, title, description, children }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{children && <div className="page-heading-actions">{children}</div>}</div>;
}
function ModeBadge({ lead, demo = false }) {
  const source = typeof lead === 'string' ? lead : lead?.source || (demo ? 'demo' : 'google');
  if (source === 'manual') return <span className="manual-badge"><span className="manual-dot" /> {manualLeadSourceLabel(source).toUpperCase()}</span>;
  if (source === 'demo') return <span className="sample-badge"><span className="sample-dot" /> DEMO</span>;
  if (source === 'osm') return <span className="osm-badge"><span className="osm-dot" /> OPENSTREETMAP</span>;
  if (source === 'gemini') return <span className="google-badge"><Sparkles size={12} /> GEMINI + GOOGLE MAPS</span>;
  return <span className="google-badge"><Globe2 size={12} /> GOOGLE PLACES</span>;
}
function missingLeadValue(lead, otherLabel = 'Not provided') {
  if (lead?.source === 'manual') return 'Not provided';
  return otherLabel;
}
function isUserProvidedManualField(lead, field) {
  return lead?.source === 'manual' || lead?.manualUserFields?.includes(field);
}
function leadRatingSummary(lead) {
  if (lead?.needsRefresh) return 'Refresh to load current rating and review count';
  const manualRating = isUserProvidedManualField(lead, 'rating');
  const manualReviews = isUserProvidedManualField(lead, 'reviews');
  const ratingAvailable = lead?.source === 'manual' ? lead.rating != null : Number(lead?.rating) > 0;
  const reviewsAvailable = lead?.source === 'manual' ? lead.reviews != null : Number(lead?.reviews) > 0;
  const rating = ratingAvailable ? `${Number(lead.rating).toFixed(1)} rating${manualRating ? ' · user-provided' : ''}` : '';
  const reviews = reviewsAvailable ? `${Number(lead.reviews).toLocaleString()} reviews${manualReviews ? ' · user-provided' : ''}` : '';
  return [rating, reviews].filter(Boolean).join(' · ') || (lead?.source === 'manual' ? 'Not provided' : isOsmLead(lead) ? 'Not provided by OpenStreetMap' : 'Not returned by Google');
}
function GoogleDisclosure({ compact = false }) {
  return <div className={`google-disclosure ${compact ? 'google-disclosure-compact' : ''}`}>
    <div className="google-attribution" aria-label="Google Maps attribution"><span className="google-text-attribution" translate="no">Google Maps</span><span className="attribution-context">Business listing data</span></div>
    <p className="google-source-note"><Info size={12} /> Google search ranking considers relevance, distance, and prominence. Ratings and review counts are user-generated; Google checks for and removes fake content when identified. <a href="https://support.google.com/contributionpolicy/answer/7422880" target="_blank" rel="noreferrer">Review policy</a></p>
  </div>;
}
function OsmDisclosure({ matchedCategory = '', queriedTags = [], resolvedLocation = '' }) {
  const tagText = queriedTags.length ? queriedTags.join(', ') : '';
  return <div className="google-disclosure">
    <div className="osm-attribution" aria-label="OpenStreetMap attribution">
      <span className="osm-text-attribution" translate="no">{OSM_ATTRIBUTION}</span>
      <span className="attribution-context">Map and business data</span>
    </div>
    <p className="google-source-note"><Info size={12} /> Data from OpenStreetMap, a community-maintained map, made available under the <a href={OSM_LICENSE_URL} target="_blank" rel="noreferrer">Open Database License</a>. Coverage varies by area; a missing field is unknown, not evidence of a gap.{matchedCategory ? ` Matched category: ${matchedCategory}${tagText ? ` (${tagText})` : ''}.` : ''}{resolvedLocation ? ` Searched around: ${resolvedLocation}.` : ''}</p>
  </div>;
}
function PriorityLabel({ tier }) { return <span className={`priority-label priority-${tier}`}>{tier === 'high' ? <Flame size={13} /> : tier === 'medium' ? <span className="priority-sun" /> : <span className="priority-ring" />}{tier === 'high' ? 'HOT' : tier === 'medium' ? 'WARM' : 'COLD'}</span>; }
function EmptyState({ icon: Icon, title, body, actionLabel, onAction }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={19} /></div><strong>{title}</strong><p>{body}</p>{actionLabel && <button className="button button-secondary button-small" type="button" onClick={onAction}>{actionLabel} <ArrowRight size={14} /></button>}</div>;
}

function DashboardPage({ leads, getCrm, onNavigate, onOpenLead, onExport }) {
  const sourceCounts = [
    { source: 'manual', label: 'Manual' },
    { source: 'google', label: 'Google Places' },
    { source: 'osm', label: 'OpenStreetMap' },
    { source: 'demo', label: 'Demo' },
  ].map(({ source, label }) => ({ source, label, count: leads.filter((lead) => (lead.source || (lead.demo ? 'demo' : 'google')) === source).length }));
  const stats = [
    { label: 'Total leads', value: leads.length, icon: Users, tone: 'blue', caption: 'In your workspace' },
    { label: 'HOT leads', value: leads.filter((lead) => scoreOpportunity(lead).score >= 80).length, icon: Flame, tone: 'amber', caption: 'Score 80–100' },
    { label: 'Contacted', value: leads.filter((lead) => !['NEW', 'RESEARCHED', 'DO NOT CONTACT'].includes(getCrm(lead).status)).length, icon: Send, tone: 'violet', caption: 'Manual outreach' },
    { label: 'Replies', value: leads.filter((lead) => ['REPLIED', 'INTERESTED', 'CALL BOOKED', 'PROPOSAL', 'WON'].includes(getCrm(lead).status)).length, icon: MessageCircle, tone: 'green', caption: 'Pipeline replies' },
    { label: 'Meetings', value: leads.filter((lead) => ['CALL BOOKED', 'PROPOSAL'].includes(getCrm(lead).status)).length, icon: CalendarDays, tone: 'cyan', caption: 'Booked or proposed' },
    { label: 'Won', value: leads.filter((lead) => getCrm(lead).status === 'WON').length, icon: Award, tone: 'lime', caption: 'Closed won' },
  ];
  const pipeline = [
    { label: 'New & researched', statuses: ['NEW', 'RESEARCHED'], color: 'var(--blue-400)' },
    { label: 'Outreach sent', statuses: ['CONTACTED'], color: 'var(--purple-400)' },
    { label: 'In conversation', statuses: ['REPLIED', 'INTERESTED'], color: 'var(--green-400)' },
    { label: 'Meeting / proposal', statuses: ['CALL BOOKED', 'PROPOSAL'], color: 'var(--cyan-400)' },
    { label: 'Won', statuses: ['WON'], color: 'var(--lime-400)' },
  ].map((stage) => ({ ...stage, count: leads.filter((lead) => stage.statuses.includes(getCrm(lead).status)).length }));
  const maxStage = Math.max(1, ...pipeline.map((stage) => stage.count));
  const highest = [...leads].sort((a, b) => scoreOpportunity(b).score - scoreOpportunity(a).score).slice(0, 4);
  const today = localDateString();
  const due = leads.filter((lead) => { const crm = getCrm(lead); return crm.nextFollowUp && crm.nextFollowUp <= today && !['WON', 'LOST', 'DO NOT CONTACT'].includes(crm.status); }).sort((a, b) => getCrm(a).nextFollowUp.localeCompare(getCrm(b).nextFollowUp));
  const dateLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
  return <div className="page-stack">
    <PageHeading eyebrow={dateLabel} title="Your pipeline, at a glance." description="A clear view of the relationships you’re building."><button className="button button-secondary" type="button" onClick={onExport} disabled={!leads.length}><Download size={16} /> Export workflow</button><button className="button button-primary" type="button" onClick={() => onNavigate('Find Leads')}><Plus size={16} /> Find new leads</button></PageHeading>
    <section className="kpi-grid" aria-label="Pipeline metrics">{stats.map(({ label, value, icon: Icon, tone, caption }) => <div className="kpi-card" key={label}><div className={`kpi-icon kpi-${tone}`}><Icon size={17} strokeWidth={1.8} /></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-caption">{caption}</div></div>)}</section>
    <section className="surface-card source-counts-card" aria-label="Lead counts by source"><div className="source-counts-heading"><div><div className="card-kicker">LEAD SOURCES</div><h2>Where your leads came from</h2></div><span>Current workspace</span></div><div className="source-counts-grid">{sourceCounts.map(({ source, label, count }) => <div className={`source-count-item source-count-${source}`} key={source}><span className="source-count-dot" /><span>{label}</span><strong>{count}</strong></div>)}</div></section>
    <div className="dashboard-main-grid">
      <section className="surface-card pipeline-card"><div className="card-heading-row"><div><div className="card-kicker">PIPELINE HEALTH</div><h2>Lead stages</h2></div><span className="quiet-chip"><Activity size={13} /> Workspace snapshot</span></div><div className="pipeline-summary"><strong>{leads.length}</strong><span>leads in the current workspace</span><ArrowUpRight size={16} /></div><div className="pipeline-bars">{pipeline.map((stage) => <div className="pipeline-row" key={stage.label}><div className="pipeline-row-head"><span>{stage.label}</span><strong>{stage.count}</strong></div><div className="pipeline-track"><span style={{ width: `${leads.length ? Math.max(stage.count ? 8 : 0, (stage.count / maxStage) * 100) : 0}%`, background: stage.color }} /></div></div>)}</div><div className="pipeline-footnote"><span className="legend-dot" /> Counts reflect current CRM statuses; no messages are sent automatically.</div></section>
      <section className="surface-card priority-card"><div className="card-heading-row"><div><div className="card-kicker">BEST NEXT OPPORTUNITIES</div><h2>Worth a closer look</h2></div><button className="text-button" type="button" onClick={() => onNavigate('Leads')}>View all <ArrowRight size={14} /></button></div>{highest.length ? <div className="opportunity-list">{highest.map((lead) => { const crm = getCrm(lead); return <button type="button" className="opportunity-row" key={getLeadKey(lead)} onClick={() => onOpenLead(lead)}><div className="business-avatar">{initials(lead.name)}</div><div className="opportunity-copy"><strong>{lead.name}</strong><span>{lead.category} <i>·</i> {lead.city || lead.address || 'Location not returned'}</span></div><div className="opportunity-right"><ScorePill lead={lead} compact /><span className={`stage-mini stage-${crm.status.toLowerCase().replaceAll(' ', '-')}`}>{titleCaseStatus(crm.status)}</span></div></button>; })}</div> : <EmptyState icon={Target} title="Your shortlist starts here" body="Add a few prospects to see evidence-based opportunities." actionLabel="Find leads" onAction={() => onNavigate('Find Leads')} />}{leads.some((lead) => lead.source === 'google') && <GoogleDisclosure />}</section>
    </div>
    <div className="dashboard-bottom-grid">
      <section className="surface-card followup-card"><div className="card-heading-row"><div><div className="card-kicker">FOLLOW-UP QUEUE</div><h2>Suggested next steps</h2></div><button className="text-button" type="button" onClick={() => onNavigate('Campaigns')}>View cadence <ArrowRight size={14} /></button></div>{due.length ? <div className="followup-list">{due.map((lead) => { const crm = getCrm(lead); return <div className="followup-row" key={getLeadKey(lead)}><div className="followup-date"><CalendarDays size={15} /><span>{formatDate(crm.nextFollowUp)}</span></div><div className="followup-copy"><strong>{lead.name}</strong><span>{crm.nextFollowUp < today ? 'Suggested follow-up is overdue' : 'Suggested follow-up is due today'}</span></div><button className="icon-button small-icon-button" aria-label={`Open ${lead.name}`} onClick={() => onOpenLead(lead)}><ArrowUpRight size={16} /></button></div>; })}</div> : <div className="empty-inline"><div className="empty-inline-icon"><Check size={16} /></div><div><strong>Nothing waiting on you</strong><span>Follow-up dates are suggestions; you choose what to send and when.</span></div></div>}<div className="compliance-note"><ShieldCheck size={14} /> Every follow-up is a draft suggestion. Nothing is sent in the background.</div></section>
      <section className="surface-card insight-card"><div className="insight-icon"><Sparkles size={18} /></div><div className="card-kicker">A LITTLE MORE SIGNAL</div><h2>Good outreach starts with good evidence.</h2><p>Scores are built from visible listing and website signals. Review the evidence, personalize the draft, and decide if a conversation is appropriate.</p><button className="text-button" type="button" onClick={() => onNavigate('Settings')}>See how scoring works <ArrowRight size={14} /></button></section>
    </div>
  </div>;
}

function FinderPage({ searchForm, setSearchForm, onSearch, searching, searchError, results, source, warnings, requests, geocodingRequests, history, onSelectHistory, hasRun, query, configLoading, leads, onAdd, onOpenLead, onManualEntries, config, osmMeta }) {
  const updateField = (key, value) => setSearchForm((current) => ({ ...current, [key]: value }));
  const added = (lead) => leads.some((item) => getLeadKey(item) === getLeadKey(lead));
  const sourceChoice = searchForm.source || 'gemini';
  const sourceOptions = [
    { id: 'gemini', title: 'Gemini AI + Google Maps', detail: 'Grounded business discovery', disabled: false },
    { id: 'demo', title: 'Demo sample', detail: 'Fictional Pune businesses', disabled: false },
  ];
  return <div className="page-stack">
    <PageHeading eyebrow="PROSPECTING" title="Find the right businesses." description="Search local businesses, then decide which ones belong in your pipeline."><span className="privacy-chip"><ShieldCheck size={14} /> Official sources. Manual outreach.</span></PageHeading>
    <section className="surface-card finder-form-card"><div className="finder-form-top"><div><div className="card-kicker">BUSINESS SEARCH</div><h2>Where should we look?</h2><p>Find real businesses with Gemini AI and Google Maps grounding. Add your Gemini API key in Settings; access and quota depend on your Google AI Studio project. The fictional sample set is available for testing.</p></div><div className="finder-search-icon"><Search size={21} /></div></div>
      <div className="source-choice-row">
        <span>Data source</span>
        <div className="source-choice-group" role="radiogroup" aria-label="Lead data source">
          {sourceOptions.map((option) => <button type="button" key={option.id} className={`source-choice ${sourceChoice === option.id ? 'source-choice-active' : ''}`} aria-pressed={sourceChoice === option.id} disabled={option.disabled} title={option.disabled ? 'This source is unavailable.' : undefined} onClick={() => updateField('source', option.id)}>
            <strong>{option.title}</strong><span>{option.detail}</span>
          </button>)}
        </div>
      </div>
      {sourceChoice === 'gemini' && <div className="results-note free-hint"><Info size={14} />Uses the Gemini API key saved in Settings and Google Maps grounding. Free-tier eligibility, rate limits, and any billing requirements are controlled by Google for your project.</div>}
      <form className="finder-form" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
        <label className="field-group"><span>Industry or category</span><div className="input-with-icon"><Building2 size={16} /><input value={searchForm.category} onChange={(event) => updateField('category', event.target.value)} placeholder="e.g. Dental clinics" maxLength={100} /></div></label>
        <label className="field-group"><span>City or location</span><div className="input-with-icon"><MapPin size={16} /><input value={searchForm.city} onChange={(event) => updateField('city', event.target.value)} placeholder="e.g. Pune" maxLength={160} /></div></label>
        <label className="field-group field-select"><span>Search radius</span><div className="select-wrap"><select value={searchForm.radiusKm} onChange={(event) => updateField('radiusKm', event.target.value)}><option value="2">2 km</option><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select><ChevronDown size={15} /></div></label>
        <label className="field-group field-select"><span>Maximum results</span><div className="select-wrap"><select value={searchForm.maxResults} onChange={(event) => updateField('maxResults', event.target.value)}><option value="5">5 results</option><option value="10">10 results</option><option value="20">20 results</option><option value="50">50 results</option></select><ChevronDown size={15} /></div></label>
        <button className="button button-primary finder-submit" type="submit" disabled={searching || configLoading}>{searching ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}{searching ? 'Searching…' : 'Search businesses'}</button>
      </form>
      {searchError && <div className="inline-error"><Info size={15} />{searchError}</div>}
      <div className="example-row"><span>Try a search</span>{EXAMPLE_SEARCHES.map((example) => <button type="button" key={example} className="example-chip" onClick={() => { const [category, city] = example.split(/\s+in\s+/i); setSearchForm((current) => ({ ...current, category, city })); }}>{example}</button>)}</div>
      {history.length > 0 && <div className="search-history-row"><span><History size={13} /> Recent searches</span>{history.map((entry, index) => <button type="button" key={`${entry.category}-${entry.city}-${index}`} className="history-chip" onClick={() => onSelectHistory(entry)}>{entry.category} · {entry.city}</button>)}</div>}
      <div className="finder-form-foot"><ShieldCheck size={14} /> No Google Maps or Places API is used. OpenStreetMap data is community-maintained; demo results are clearly marked as fictional.</div>
    </section>
    <ManualLeadTools leads={leads} results={results} onImport={onManualEntries} />
    {hasRun ? <section className={`finder-results-section ${source === 'google' ? 'google-results-container' : ''}`}><div className="results-heading"><div><div className="card-kicker">SEARCH RESULTS</div><h2>{results.length} {results.length === 1 ? 'business' : 'businesses'} <span>for “{query}”</span></h2></div><ModeBadge lead={source} /></div>
      {warnings.map((warning) => <div className="results-note" key={warning}><Info size={14} />{warning}</div>)}
      {source === 'google' && <div className="results-note request-cost-note"><Info size={14} />{requests} Text Search {requests === 1 ? 'request' : 'requests'} used{geocodingRequests ? ` + ${geocodingRequests} Geocoding request for radius bias` : ''}. Place Details are requested only when you manually refresh a saved place, at most once per place per app session.</div>}
      {source === 'osm' && <div className="results-note request-cost-note"><Info size={14} /><span>Free OpenStreetMap search. Results may be incomplete and should be verified before outreach.</span></div>}
      {results.length ? <div className="finder-results-grid">{results.map((lead) => { const isAdded = added(lead); const ratingText = [Number(lead.rating) > 0 ? `${Number(lead.rating).toFixed(1)} rating${isUserProvidedManualField(lead, 'rating') ? ' · user-provided' : ''}` : '', Number(lead.reviews) > 0 ? `${Number(lead.reviews).toLocaleString()} reviews${isUserProvidedManualField(lead, 'reviews') ? ' · user-provided' : ''}` : ''].filter(Boolean).join(' · ') || 'Rating and review count not available'; const reasons = whyThisLead(lead).slice(0, 3); const recommendations = recommendService(lead).slice(0, 2); return <article className="finder-result-card" key={getLeadKey(lead)}>
        <div className="result-card-head"><div className="business-avatar business-avatar-large">{initials(lead.name)}</div><div className="result-title"><h3>{lead.name}</h3><span>{lead.category || 'Category not returned'}</span></div><ScorePill lead={lead} compact /></div>
        <div className="result-detail"><MapPin size={14} /><span>{lead.address || lead.city || 'Address not returned'}</span></div>
        <div className="result-detail"><Star size={14} className="star-icon" /><span>{ratingText}</span></div>
        {lead.phone && <div className="result-detail"><Phone size={14} /><span>{lead.phone} · {isUserProvidedManualField(lead, 'phone') ? 'user-entered business phone' : 'public business phone'}</span></div>}
        <div className="result-detail"><Globe2 size={14} />{lead.demo ? <span>{lead.website ? 'Reserved sample URL only' : 'No website field in sample'}</span> : safeHttpUrl(lead.website) ? <a className="result-website-link" href={safeHttpUrl(lead.website)} target="_blank" rel="noreferrer">{lead.website}</a> : <span>{lead.website ? 'Invalid website URL' : 'Website not listed'}</span>}</div>
        <div className="lead-evidence-panel"><strong>Why this lead?</strong><ul>{reasons.map((reason) => <li key={reason.key} className={`evidence-${reason.type}`}>{reason.text}</li>)}</ul><div className="service-recommendation"><Tag size={13} /><span><b>Potential service:</b> {recommendations[0].service} · {recommendations[0].reason}</span></div></div>
        {lead.placeId && !lead.demo && <div className="place-id-line"><span>{isOsmLead(lead) ? 'OpenStreetMap object' : 'Google Place ID'}</span><code title={lead.placeId}>{lead.placeId}</code></div>}
        {lead.demo && <div className="demo-disclaimer"><Info size={13} /> Fictional demo business. Not contactable.</div>}
        <div className="result-card-actions"><button className={`button ${isAdded ? 'button-secondary' : 'button-primary'} button-small`} onClick={() => onAdd(lead)} type="button">{isAdded ? <><Check size={15} /> {leads.find((item) => getLeadKey(item) === getLeadKey(lead))?.needsRefresh ? 'Refresh from result' : 'In your leads'}</> : <><Plus size={15} /> Add to leads</>}</button>{isAdded && <button className="button button-quiet button-small" type="button" onClick={() => onOpenLead(lead)}>Details <ArrowRight size={14} /></button>}{safeHttpUrl(lead.mapsUrl) && <a className="maps-result-link" href={safeHttpUrl(lead.mapsUrl)} target="_blank" rel="noreferrer"><MapPin size={13} /> {isOsmLead(lead) ? 'OSM' : 'Maps'} <ExternalLink size={12} /></a>}</div>
      </article>; })}</div> : <EmptyState icon={Search} title="No businesses found" body={source === 'demo' ? 'The explicitly selected sample set contains fictional Pune businesses only. Try one of the example searches above.' : source === 'gemini' ? 'Gemini + Google Maps returned no matching businesses. Try a broader category, nearby city, or larger radius.' : 'Try a broader category or a nearby city.'} />}
      {source === 'google' && <GoogleDisclosure />}{source === 'gemini' && <GoogleDisclosure />}{source === 'osm' && <OsmDisclosure matchedCategory={osmMeta?.matchedCategory} queriedTags={osmMeta?.queriedTags} resolvedLocation={osmMeta?.resolvedLocation} />}{source === 'demo' && <div className="demo-result-footnote"><Info size={14} /> Fictional demo dataset · Search details are illustrative and are not Google Places results.</div>}
    </section> : <div className="finder-placeholder"><div className="placeholder-orbit"><Search size={22} /></div><h2>Start with a local search.</h2><p>Choose an industry and a city. AgencyOS will bring the business profile signals into one calm workspace.</p><div className="placeholder-points"><span><CheckCircle2 size={15} /> Evidence-based scoring</span><span><CheckCircle2 size={15} /> No automated outreach</span><span><CheckCircle2 size={15} /> Your choice, every time</span></div></div>}
  </div>;
}

const EMPTY_MANUAL_LEAD_FORM = {
  name: '', category: '', city: '', website: '', phone: '', email: '', mapsUrl: '', address: '',
  rating: '', reviews: '', instagram: '', facebook: '', notes: '',
};

function ManualLeadTools({ leads, results, onImport }) {
  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState(EMPTY_MANUAL_LEAD_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [pendingManual, setPendingManual] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const fileInput = useRef(null);
  const candidates = useMemo(() => dedupeLeads([...leads, ...results]), [leads, results]);

  function updateForm(key, value) {
    setFormValues((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => ({ ...current, [key]: '' }));
  }
  function closeManualForm() {
    setFormOpen(false);
    setPendingManual(null);
    setFormErrors({});
  }
  function submitManualForm(event) {
    event.preventDefault();
    const validation = validateManualLead(formValues);
    setFormErrors(validation.errors);
    if (!validation.valid) return;
    const duplicate = findManualLeadDuplicate(validation.values, candidates);
    if (duplicate) {
      setPendingManual({ values: validation.values, duplicate });
      return;
    }
    onImport([validation.values], 'add');
    setFormValues(EMPTY_MANUAL_LEAD_FORM);
    closeManualForm();
  }
  function resolveManualDuplicate(mode) {
    if (!pendingManual) return;
    if (mode !== 'cancel') onImport([pendingManual.values], mode);
    setFormValues(EMPTY_MANUAL_LEAD_FORM);
    closeManualForm();
  }
  async function readCsvFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setImportError('');
    setPreview(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setImportError('CSV files must be 5 MB or smaller. Split larger files and import them separately.');
      return;
    }
    try {
      const parsed = parseManualLeadCsv(await file.text());
      if (parsed.error) {
        setPreview({ fileName: file.name, error: parsed.error, rows: [] });
        return;
      }
      const seen = [...candidates];
      const rows = parsed.rows.map((row) => {
        const duplicate = row.valid ? findManualLeadDuplicate(row.values, seen) : null;
        if (row.valid) seen.push({ ...row.values, id: `csv-preview-${row.rowNumber}`, source: 'manual' });
        return { ...row, duplicate };
      });
      setPreview({ fileName: file.name, error: '', rows });
    } catch {
      setPreview({ fileName: file.name, error: 'The selected file could not be read as text. Choose a UTF-8 CSV file.', rows: [] });
    }
  }
  function confirmCsvImport(mode) {
    if (!preview) return;
    const rows = preview.rows.filter((row) => row.valid);
    if (rows.length) onImport(rows, mode);
    setPreview(null);
  }

  const validRows = preview?.rows.filter((row) => row.valid) || [];
  const invalidRows = preview?.rows.filter((row) => !row.valid) || [];
  const duplicateRows = validRows.filter((row) => row.duplicate);

  return <section className="surface-card manual-tools-card" aria-labelledby="manual-import-title">
    <div className="manual-tools-header">
      <div><div className="card-kicker">FREE · NO API KEY REQUIRED</div><h2 id="manual-import-title">Manual Lead Import</h2><p>Add one business or import a CSV you already have. Manual entry and CSV import make no Google Places API calls and never scrape Google Maps.</p><small className="manual-import-help"><strong>CSV tip:</strong> Business Name is required. Industry and City are optional for imports, so scraper files with fields like Name, Title, Phone, Website, Address or Location can be imported too.</small></div>
      <div className="manual-tools-actions">
        <button className="button button-secondary" type="button" onClick={() => { setFormOpen((value) => !value); setPendingManual(null); }}><Plus size={15} /> Add Manual Lead</button>
        <button className="button button-primary" type="button" onClick={() => fileInput.current?.click()}><Upload size={15} /> Import CSV</button>
        <input ref={fileInput} className="visually-hidden-file" type="file" accept=".csv,text/csv" aria-label="Choose a CSV file to import" onChange={readCsvFile} />
      </div>
    </div>
    <div className="manual-free-note"><ShieldCheck size={14} /><span>Manual leads are saved in this browser, use the existing CRM and follow-up workflow, and stay separate from Google Places results.</span><a href="https://www.google.com/maps" target="_blank" rel="noreferrer"><MapPin size={13} /> Open Google Maps <ExternalLink size={11} /></a></div>
    {importError && <div className="inline-error" role="alert"><Info size={15} />{importError}</div>}

    {formOpen && <form className="manual-lead-form" onSubmit={submitManualForm} noValidate>
      <div className="manual-form-heading"><div><div className="card-kicker">NEW CRM RECORD</div><h3>Add a business manually</h3></div><span className="manual-source-pill">Manual</span></div>
      <div className="manual-form-grid">
        <label className="field-group"><span>Business Name <b>*</b></span><input className="field-input" value={formValues.name} onChange={(event) => updateForm('name', event.target.value)} maxLength={160} autoComplete="organization" required aria-invalid={Boolean(formErrors.name)} />{formErrors.name && <small className="manual-field-error">{formErrors.name}</small>}</label>
        <label className="field-group"><span>Industry <b>*</b></span><input className="field-input" value={formValues.category} onChange={(event) => updateForm('category', event.target.value)} maxLength={100} placeholder="e.g. Dental clinic" required aria-invalid={Boolean(formErrors.category)} />{formErrors.category && <small className="manual-field-error">{formErrors.category}</small>}</label>
        <label className="field-group"><span>City <b>*</b></span><input className="field-input" value={formValues.city} onChange={(event) => updateForm('city', event.target.value)} maxLength={160} autoComplete="address-level2" required aria-invalid={Boolean(formErrors.city)} />{formErrors.city && <small className="manual-field-error">{formErrors.city}</small>}</label>
        <label className="field-group"><span>Website <small>optional</small></span><input className="field-input" value={formValues.website} onChange={(event) => updateForm('website', event.target.value)} maxLength={2048} placeholder="https://example.com" inputMode="url" aria-invalid={Boolean(formErrors.website)} />{formErrors.website && <small className="manual-field-error">{formErrors.website}</small>}</label>
        <label className="field-group"><span>Phone <small>optional</small></span><input className="field-input" value={formValues.phone} onChange={(event) => updateForm('phone', event.target.value)} maxLength={64} autoComplete="tel" placeholder="+91 …" aria-invalid={Boolean(formErrors.phone)} />{formErrors.phone && <small className="manual-field-error">{formErrors.phone}</small>}</label>
        <label className="field-group"><span>Email <small>optional</small></span><input className="field-input" type="email" value={formValues.email} onChange={(event) => updateForm('email', event.target.value)} maxLength={254} autoComplete="email" placeholder="name@business.com" aria-invalid={Boolean(formErrors.email)} />{formErrors.email && <small className="manual-field-error">{formErrors.email}</small>}</label>
        <label className="field-group"><span>Google Maps URL <small>optional</small></span><input className="field-input" value={formValues.mapsUrl} onChange={(event) => updateForm('mapsUrl', event.target.value)} maxLength={2048} placeholder="Paste a public Google Maps link" inputMode="url" aria-invalid={Boolean(formErrors.mapsUrl)} />{formErrors.mapsUrl && <small className="manual-field-error">{formErrors.mapsUrl}</small>}<small className="manual-field-help"><a href="https://www.google.com/maps" target="_blank" rel="noreferrer">Open Google Maps <ExternalLink size={10} /></a> to copy a public link. No scraping or automation is performed.</small></label>
        <label className="field-group"><span>Address <small>optional</small></span><input className="field-input" value={formValues.address} onChange={(event) => updateForm('address', event.target.value)} maxLength={500} autoComplete="street-address" aria-invalid={Boolean(formErrors.address)} />{formErrors.address && <small className="manual-field-error">{formErrors.address}</small>}</label>
        <label className="field-group"><span>Rating <small>optional · 0–5</small></span><input className="field-input" type="number" min="0" max="5" step="0.1" value={formValues.rating} onChange={(event) => updateForm('rating', event.target.value)} placeholder="Not provided" aria-invalid={Boolean(formErrors.rating)} />{formErrors.rating && <small className="manual-field-error">{formErrors.rating}</small>}</label>
        <label className="field-group"><span>Review Count <small>optional</small></span><input className="field-input" type="number" min="0" step="1" value={formValues.reviews} onChange={(event) => updateForm('reviews', event.target.value)} placeholder="Not provided" aria-invalid={Boolean(formErrors.reviews)} />{formErrors.reviews && <small className="manual-field-error">{formErrors.reviews}</small>}</label>
        <label className="field-group"><span>Instagram <small>optional · profile URL</small></span><input className="field-input" value={formValues.instagram} onChange={(event) => updateForm('instagram', event.target.value)} maxLength={2048} placeholder="https://instagram.com/business" inputMode="url" aria-invalid={Boolean(formErrors.instagram)} />{formErrors.instagram && <small className="manual-field-error">{formErrors.instagram}</small>}</label>
        <label className="field-group"><span>Facebook <small>optional · profile URL</small></span><input className="field-input" value={formValues.facebook} onChange={(event) => updateForm('facebook', event.target.value)} maxLength={2048} placeholder="https://facebook.com/business" inputMode="url" aria-invalid={Boolean(formErrors.facebook)} />{formErrors.facebook && <small className="manual-field-error">{formErrors.facebook}</small>}</label>
        <label className="field-group manual-notes-field"><span>Notes <small>optional · private to this browser</small></span><textarea className="field-input" rows={3} value={formValues.notes} onChange={(event) => updateForm('notes', event.target.value)} maxLength={5000} placeholder="Context, source, or next steps" /></label>
      </div>
      <div className="manual-form-footer"><span><Info size={13} /> Blank optional fields remain “Not provided” and are not scored as business weaknesses.</span><div><button className="button button-quiet" type="button" onClick={closeManualForm}>Cancel</button><button className="button button-primary" type="submit"><Plus size={15} /> Add to CRM</button></div></div>
    </form>}

    {pendingManual && <div className="manual-duplicate-warning" role="alert"><Info size={16} /><div><strong>Possible duplicate: {pendingManual.duplicate.lead.name}</strong><span>Matched by {pendingManual.duplicate.reason}; source: {manualLeadSourceLabel(pendingManual.duplicate.lead)}.{pendingManual.duplicate.lead.source === 'demo' ? ' Fictional demo records are never overwritten; add this as a separate Manual lead.' : ''}</span><div className="manual-duplicate-actions"><button className="button button-quiet button-small" type="button" onClick={() => resolveManualDuplicate('cancel')}>Cancel</button><button className="button button-secondary button-small" type="button" onClick={() => resolveManualDuplicate('add')}>Add anyway</button><button className="button button-primary button-small" type="button" disabled={pendingManual.duplicate.lead.source === 'demo'} onClick={() => resolveManualDuplicate('update')}>Update existing</button></div></div></div>}

    {preview && <div className="csv-import-preview" role="region" aria-label="CSV import preview">
      <div className="csv-preview-heading"><div><div className="card-kicker">REVIEW BEFORE IMPORT</div><h3>{preview.fileName}</h3><p>{preview.error || `${validRows.length} valid · ${duplicateRows.length} possible duplicates · ${invalidRows.length} rows need correction`}</p></div><span className="csv-preview-badge">PREVIEW</span></div>
      {preview.error ? <div className="inline-error" role="alert"><Info size={15} />{preview.error}</div> : <div className="csv-preview-list">{preview.rows.map((row) => <div className={`csv-preview-row ${row.valid ? '' : 'csv-row-invalid'}`} key={`${row.rowNumber}-${row.values.name || 'blank'}`}>
        <span className="csv-row-number">{row.rowNumber}</span><div className="csv-row-business"><strong>{row.values.name || 'Business name missing'}</strong><span>{[row.values.category, row.values.city].filter(Boolean).join(' · ') || 'Industry and city not provided'}</span>{!row.valid && <small>{Object.values(row.errors).join(' ')}</small>}{row.duplicate && <small>Possible duplicate of {row.duplicate.lead.name} ({row.duplicate.reason}; {manualLeadSourceLabel(row.duplicate.lead)}).</small>}</div>
        <span className={`csv-row-state ${!row.valid ? 'csv-row-state-invalid' : row.duplicate ? 'csv-row-state-duplicate' : 'csv-row-state-ready'}`}>{!row.valid ? 'Fix row' : row.duplicate ? 'Duplicate' : 'Ready'}</span>
      </div>)}</div>}
      <div className="csv-preview-footer"><span><ShieldCheck size={13} /> Import reads the file locally. No Places search, website fetch, or message is triggered. Demo samples are never overwritten; an Update existing match to Demo is added as a separate Manual lead.</span><div><button className="button button-quiet" type="button" onClick={() => setPreview(null)}>Cancel</button><button className="button button-secondary" type="button" onClick={() => confirmCsvImport('add')} disabled={!validRows.length}>Add anyway</button><button className="button button-primary" type="button" onClick={() => confirmCsvImport('update')} disabled={!validRows.length}>Update existing</button></div></div>
    </div>}
  </section>;
}

function LeadsPage({ leads, allCount, getCrm, search, setSearch, statusFilter, setStatusFilter, priorityFilter, setPriorityFilter, sortKey, sortDirection, onSort, onOpenLead, onPitch, onStatus, onBulkUpdate, onBulkRemove, onRemove, onRefreshDetails, refreshingDetailsIds, onExport, onFind }) {
  const hasGoogleData = leads.some((lead) => lead.source === 'google');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkService, setBulkService] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const visibleIds = leads.map(getLeadKey);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((current) => current.filter((id) => visible.has(id)));
  }, [leads]);
  function applyBulkAction() {
    const patch = {};
    if (bulkStatus) patch.status = bulkStatus;
    if (bulkService) patch.assignedService = bulkService;
    if (bulkTag.trim()) patch.addTag = bulkTag.trim().slice(0, 40);
    if (!Object.keys(patch).length || !selectedIds.length) return;
    onBulkUpdate(selectedIds, patch);
    setBulkStatus(''); setBulkService(''); setBulkTag(''); setSelectedIds([]);
  }
  return <div className="page-stack">
    <PageHeading eyebrow="YOUR CRM" title="Leads, with context." description="Keep your research, notes, and next steps together.">
      <button className="button button-secondary" type="button" onClick={onExport} disabled={!leads.length}><Download size={16} /> Export CSV</button>
      <button className="button button-primary" type="button" onClick={onFind}><Plus size={16} /> Find leads</button>
    </PageHeading>
    <div className="lead-list-meta">
      <div className="lead-count"><strong>{leads.length}</strong> shown <span>·</span> {allCount} total</div>
      <div className="lead-filters">
        <div className="table-search"><Search size={15} /><input aria-label="Search leads" placeholder="Search businesses…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></div>
        <div className="select-with-icon"><Filter size={14} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="ALL">All statuses</option>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}</select><ChevronDown size={13} /></div>
        <div className="select-with-icon"><SlidersHorizontal size={14} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filter by priority"><option value="ALL">All priorities</option><option value="HOT">HOT · highest signal</option><option value="WARM">WARM · review</option><option value="COLD">COLD · limited signals</option></select><ChevronDown size={13} /></div>
      </div>
    </div>
    {selectedIds.length > 0 && <section className="bulk-toolbar" aria-label="Bulk CRM actions"><div className="bulk-selection-count"><strong>{selectedIds.length}</strong><span>selected</span></div><label><span>Set status</span><select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}><option value="">No change</option>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}</select></label><label><span>Assign service</span><select value={bulkService} onChange={(event) => setBulkService(event.target.value)}><option value="">No change</option>{SERVICES.map((service) => <option key={service} value={service}>{service}</option>)}</select></label><label><span>Add tag</span><input value={bulkTag} onChange={(event) => setBulkTag(event.target.value)} maxLength={40} placeholder="Tag" /></label><button className="button button-primary button-small" type="button" onClick={applyBulkAction} disabled={!bulkStatus && !bulkService && !bulkTag.trim()}>Apply CRM changes</button><button className="button button-quiet button-small" type="button" onClick={() => { if (!window.confirm(`Delete ${selectedIds.length} selected leads? This removes their saved CRM details from this browser.`)) return; onBulkRemove(selectedIds); setSelectedIds([]); }}><Trash2 size={14} /> Delete selected</button><button className="text-button" type="button" onClick={() => setSelectedIds([])}>Clear selection</button></section>}
    {leads.length ? <>
      <div className="surface-card table-card">
        <div className="table-wrap"><table className="lead-table">
          <thead><tr>
            <th className="select-column"><input type="checkbox" aria-label="Select all visible leads" checked={allVisibleSelected} onChange={(event) => setSelectedIds(event.target.checked ? visibleIds : [])} /></th><th><SortButton label="Business" field="name" current={sortKey} direction={sortDirection} onClick={onSort} /></th><th>Category</th><th>Location</th>
            <th><SortButton label="Rating" field="rating" current={sortKey} direction={sortDirection} onClick={onSort} /></th>
            <th><SortButton label="Reviews" field="reviews" current={sortKey} direction={sortDirection} onClick={onSort} /></th>
            <th>Website</th><th>Phone</th><th>Email</th>
            <th><SortButton label="Score" field="score" current={sortKey} direction={sortDirection} onClick={onSort} /></th>
            <th><SortButton label="Status" field="status" current={sortKey} direction={sortDirection} onClick={onSort} /></th><th>Actions</th>
          </tr></thead>
          <tbody>{leads.map((lead) => {
            const crm = getCrm(lead);
            const rating = Number(lead.rating);
            const hasRating = lead.source === 'manual' ? lead.rating != null : rating > 0;
            const hasReviews = lead.source === 'manual' ? lead.reviews != null : Number(lead.reviews) > 0;
            return <tr key={getLeadKey(lead)}>
              <td className="select-column"><input type="checkbox" aria-label={`Select ${lead.name}`} checked={selectedIds.includes(getLeadKey(lead))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, getLeadKey(lead)])] : current.filter((id) => id !== getLeadKey(lead)))} /></td>
              <td className="business-cell"><button className="business-cell-button" type="button" onClick={() => onOpenLead(lead)}><span className="business-avatar table-avatar">{initials(lead.name)}</span><span className="business-cell-copy"><strong>{lead.name}</strong><ModeBadge lead={lead} /></span></button></td>
              <td><span className="category-text">{lead.category || '—'}</span></td>
              <td><span className="location-cell" title={lead.address || lead.city}><MapPin size={13} />{lead.city || lead.address || missingLeadValue(lead, '—')}</span></td>
              <td>{hasRating ? <span className="rating-cell"><Star size={13} fill="currentColor" />{rating.toFixed(1)}</span> : <span className="muted-cell">{missingLeadValue(lead, '—')}</span>}</td>
              <td className="number-cell">{hasReviews ? Number(lead.reviews).toLocaleString() : missingLeadValue(lead, '—')}</td>
              <td>{lead.needsRefresh ? <span className="muted-cell">Refresh listing</span> : lead.website ? lead.demo ? <span className="demo-site-label">Sample URL</span> : safeHttpUrl(lead.website) ? <a className="table-link" href={safeHttpUrl(lead.website)} target="_blank" rel="noreferrer">Visit <ExternalLink size={12} /></a> : <span className="muted-cell">Invalid URL</span> : <span className="muted-cell">{missingLeadValue(lead, 'Not listed')}</span>}</td>
              <td>{lead.phone ? <span className="phone-cell" title={isUserProvidedManualField(lead, 'phone') ? 'User-entered business phone' : lead.demo ? 'Fictional demo phone' : isOsmLead(lead) ? 'Public business phone from OpenStreetMap' : 'Public business phone from Google Places'}><Phone size={12} />{lead.phone}</span> : <span className="muted-cell">{missingLeadValue(lead, '—')}</span>}</td>
              <td>{crm.email ? <button className="table-email" type="button" onClick={() => onOpenLead(lead)} title={`User-entered business email · ${crm.emailVerifiedByUser ? 'verified by you' : 'unverified'}`}>{crm.email}<small>{crm.emailVerifiedByUser ? 'USER VERIFIED' : 'UNVERIFIED'}</small></button> : <button className="add-email-button" type="button" onClick={() => onOpenLead(lead)}><Plus size={12} /> Add email</button>}</td>
              <td><ScorePill lead={lead} compact /></td>
              <td><select className={`status-select status-${crm.status.toLowerCase().replaceAll(' ', '-')}`} value={crm.status} onChange={(event) => onStatus(lead, event.target.value)} aria-label={`Status for ${lead.name}`}>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}</select></td>
              <td><div className="row-actions"><button className="icon-button small-icon-button" onClick={() => onOpenLead(lead)} aria-label={`View ${lead.name}`} title="Lead details"><ArrowUpRight size={15} /></button>{lead.needsRefresh && <button className="icon-button small-icon-button" onClick={() => onRefreshDetails(lead)} disabled={Boolean(refreshingDetailsIds[getLeadKey(lead)])} aria-label={`Refresh ${lead.name}`} title="Refresh current details from Google Places">{refreshingDetailsIds[getLeadKey(lead)] ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}</button>}<button className="icon-button small-icon-button pitch-action" onClick={() => onPitch(lead)} disabled={crm.status === 'DO NOT CONTACT' || lead.needsRefresh} aria-label={`Generate pitch for ${lead.name}`} title={crm.status === 'DO NOT CONTACT' ? 'Do Not Contact is active' : lead.needsRefresh ? 'Refresh current place details first' : 'Generate pitch'}><Sparkles size={15} /></button><button className="icon-button small-icon-button remove-lead-action" onClick={() => onRemove(lead)} aria-label={`Remove ${lead.name} from saved leads`} title="Remove saved lead"><Trash2 size={14} /></button></div></td>
            </tr>;
          })}</tbody>
        </table></div>
        <div className="table-foot"><span>Showing {leads.length} of {allCount} leads</span><span><ShieldCheck size={13} /> CRM data is saved in this browser only.</span></div>
        {hasGoogleData && <GoogleDisclosure />}
      </div>
    </> : <div className="surface-card empty-leads-card"><EmptyState icon={Users} title={allCount ? 'No leads match these filters' : 'Your lead workspace is ready'} body={allCount ? 'Try clearing a status, priority, or search filter.' : 'Use Find Leads to search OpenStreetMap or Google Places, or explicitly choose the fictional sample dataset.'} actionLabel={allCount ? 'Clear filters' : 'Find leads'} onAction={allCount ? () => { setSearch(''); setStatusFilter('ALL'); setPriorityFilter('ALL'); } : onFind} /></div>}
    <div className="export-note"><Info size={14} /><span>CSV exports manual user-entered details and CRM workflow fields. Google Places business details are intentionally excluded.</span></div>
  </div>;
}
function SortButton({ label, field, current, direction, onClick }) { return <button type="button" className={`sort-button ${current === field ? 'sort-button-active' : ''}`} onClick={() => onClick(field)}>{label}<ArrowDownUp size={12} className={current === field ? `sort-arrow sort-${direction}` : 'sort-arrow'} /></button>; }

function CampaignsPage({ leads, getCrm, onOpenLead, onPitch }) {
  const today = localDateString();
  const queue = leads.map((lead) => ({ lead, crm: getCrm(lead) })).filter(({ crm }) => crm.nextFollowUp && !['WON', 'LOST', 'DO NOT CONTACT'].includes(crm.status)).sort((a, b) => a.crm.nextFollowUp.localeCompare(b.crm.nextFollowUp));
  const upcoming = queue.filter(({ crm }) => crm.nextFollowUp >= today);
  const due = queue.filter(({ crm }) => crm.nextFollowUp < today);
  const eligible = leads.find((lead) => !lead.needsRefresh && !['DO NOT CONTACT', 'WON', 'LOST'].includes(getCrm(lead).status));
  const steps = [
    { day: 'DAY 0', title: 'Initial outreach', desc: 'A short, evidence-led introduction with one relevant observation.', icon: Send, tone: 'timeline-blue' },
    { day: 'DAY 3', title: 'Helpful follow-up', desc: 'Add one useful idea or a small example. Keep it easy to decline.', icon: MessageCircle, tone: 'timeline-violet' },
    { day: 'DAY 7', title: 'Useful follow-up', desc: 'Share one relevant idea, then leave room for a no or no reply.', icon: Check, tone: 'timeline-green' },
    { day: 'DAY 14', title: 'Final check-in', desc: 'A final, low-pressure note. Stop after this unless they invite a response.', icon: CalendarDays, tone: 'timeline-cyan' },
  ];
  return <div className="page-stack">
    <PageHeading eyebrow="CAMPAIGNS" title="A cadence, not an autopilot." description="Plan thoughtful follow-ups. Every message is still reviewed and sent by you."><span className="manual-only-pill"><ShieldCheck size={14} /> Manual sending only</span></PageHeading>
    <div className="campaign-warning"><div className="campaign-warning-icon"><ShieldCheck size={17} /></div><div><strong>No bulk sends. No background automation.</strong><p>AgencyOS only prepares drafts and suggested dates. Opening an email or WhatsApp draft requires your explicit click; you review and send it yourself.</p></div></div>
    <section className="campaign-stat-grid"><div className="surface-card campaign-stat"><span className="campaign-stat-icon purple"><FileText size={17} /></span><span>Draft sequences</span><strong>01</strong><small>One suggested cadence</small></div><div className="surface-card campaign-stat"><span className="campaign-stat-icon blue"><Clock3 size={17} /></span><span>Follow-ups due</span><strong>{due.length}</strong><small>Dates you can review</small></div><div className="surface-card campaign-stat"><span className="campaign-stat-icon green"><CalendarDays size={17} /></span><span>Upcoming</span><strong>{upcoming.length}</strong><small>Suggestions only</small></div><div className="surface-card campaign-stat"><span className="campaign-stat-icon amber"><Send size={17} /></span><span>Automated sends</span><strong>0</strong><small>Intentionally unavailable</small></div></section>
    <div className="campaign-layout"><section className="surface-card sequence-card"><div className="card-heading-row"><div><div className="card-kicker">SUGGESTED SEQUENCE</div><h2>Local business introduction</h2></div><span className="draft-badge"><span /> Draft only</span></div><p className="sequence-intro">A respectful four-step rhythm you can adapt for each prospect. Dates begin when you manually mark the initial outreach.</p><div className="sequence-timeline">{steps.map((step, index) => { const Icon = step.icon; return <div className={`timeline-step ${step.tone}`} key={step.day}><div className="timeline-marker"><Icon size={15} /></div><div className="timeline-copy"><span>{step.day}</span><strong>{step.title}</strong><p>{step.desc}</p></div>{index < steps.length - 1 && <div className="timeline-line" />}</div>; })}</div>{eligible && <button className="button button-primary" type="button" onClick={() => onPitch(eligible)}><Sparkles size={16} /> Generate a personal draft <ArrowRight size={15} /></button>}</section>
      <section className="surface-card followup-queue-card"><div className="card-heading-row"><div><div className="card-kicker">YOUR FOLLOW-UPS</div><h2>Review the queue</h2></div><CalendarDays size={17} className="muted-icon" /></div>{queue.length ? <div className="campaign-queue-list">{queue.map(({ lead, crm }) => <div className="campaign-queue-row" key={getLeadKey(lead)}><div className={`queue-date ${crm.nextFollowUp < today ? 'queue-date-overdue' : ''}`}><span>{formatDate(crm.nextFollowUp)}</span><small>{crm.nextFollowUp < today ? 'Overdue' : 'Upcoming'}</small></div><button className="queue-lead" type="button" onClick={() => onOpenLead(lead)}><strong>{lead.name}</strong><span>{titleCaseStatus(crm.status)} <i>·</i> {crm.assignedService}</span></button><button className="icon-button small-icon-button" type="button" onClick={() => onPitch(lead)} aria-label={`Draft follow-up for ${lead.name}`}><ArrowUpRight size={15} /></button></div>)}</div> : <div className="empty-inline"><div className="empty-inline-icon"><CalendarDays size={15} /></div><div><strong>No follow-ups scheduled</strong><span>Suggested dates appear here after you set a next follow-up on a lead.</span></div></div>}<div className="campaign-queue-foot"><Info size={13} /> Due dates never trigger messages automatically.</div>{leads.some((lead) => lead.source === 'google') && <GoogleDisclosure />}</section>
    </div>
  </div>;
}

function SettingsPage({ config, notice, onRefresh, onNavigate, geminiApiKey, onGeminiApiKeyChange, geminiTesting, onTestGemini }) {
  return <div className="page-stack">
    <PageHeading eyebrow="WORKSPACE PREFERENCES" title="Settings & integrations." description="Know what is connected, where data lives, and what AgencyOS will never do." />
    <section className={`integration-status-card ${config.googlePlacesConfigured ? 'integration-ready' : ''}`}><div className="integration-icon"><Globe2 size={20} /></div><div className="integration-copy"><div className="card-kicker">LEGACY GOOGLE PLACES INTEGRATION</div><h2>{config.loading ? 'Checking server configuration…' : config.googlePlacesConfigured ? 'Legacy server key configured' : 'No legacy Places key'}</h2><p>{config.googlePlacesConfigured ? 'A legacy server-side Places key is present for refreshing older saved Google place IDs. New lead searches use the Gemini key above.' : config.reachable ? 'Normal lead discovery and the AI Business Auditor use the Gemini key above. This legacy Places key is not used for normal searches.' : 'The optional server status endpoint could not be reached. Gemini-powered features use the key above; manual entry and CSV import remain available.'}</p></div><div className={`integration-state ${config.googlePlacesConfigured ? 'integration-state-ready' : ''}`}><span />{config.loading ? 'Checking' : config.googlePlacesConfigured ? 'Configured' : 'Not configured'}</div></section>
    <div className="settings-grid">
      <section className="surface-card settings-card"><div className="card-heading-row"><div><div className="card-kicker">SHARED GEMINI AI ENGINE</div><h2>Connect Gemini once</h2></div><Sparkles size={18} className="muted-icon" /></div><p className="settings-paragraph">Use this one Gemini API key for lead discovery and the AI Business Auditor. The key stays in this browser session and is sent to Google's Gemini API; it is never committed to Revoltz.</p><label className="field-group"><span>Gemini API key</span><input className="field-input" type="password" autoComplete="off" value={geminiApiKey} onChange={(event) => onGeminiApiKeyChange(event.target.value)} placeholder="Paste your Gemini API key" /></label><div className="settings-inline-actions"><button className="button button-secondary" type="button" onClick={onTestGemini} disabled={!geminiApiKey || geminiTesting}>{geminiTesting ? 'Testing…' : 'Test Gemini key'}</button>{geminiApiKey && <button className="text-button" type="button" onClick={() => onGeminiApiKeyChange('')}>Clear key</button>}</div><div className="settings-callout"><Info size={15} /><span>Lead discovery uses Google Maps grounding through Gemini; the Business Auditor uses the same key for Gemini text generation. API usage and quota belong to your Google AI Studio project. A Jio Google AI Pro subscription is separate from Gemini API usage and does not automatically make API calls free.</span></div>{notice && <div className="settings-notice"><CheckCircle2 size={14} />{notice}</div>}<p className="settings-paragraph settings-small-note">Create/manage an API key in Google AI Studio and monitor its API usage there. Do not share your key or commit it to GitHub.</p></section>
      <section className="surface-card settings-card"><div className="card-heading-row"><div><div className="card-kicker">EXPLAINABLE AI QUALIFICATION</div><h2>Evidence in, reason out</h2></div><div className="engine-icon"><Sparkles size={16} /></div></div><p className="settings-paragraph">Lead scoring and draft outreach remain deterministic and evidence-based; Gemini is used for grounded lead discovery and the AI Business Auditor, not for every button in the CRM.</p><div className="score-rule-list"><div><span>No website listed (Google only; manual missing = unknown)</span><strong>+30</strong></div><div><span>Weak website checks</span><strong>+20</strong></div><div><span>100+ reviews / 4.5+ rating</span><strong>+15 / +10</strong></div><div><span>Operational / contact gap / social link</span><strong>+10 / +10 / +5</strong></div></div><div className="settings-callout"><Info size={15} /><span>Priority bands: HOT 80–100, WARM 50–79, COLD 0–49. These are deterministic signals, not a forecast of conversion.</span></div><div className="settings-callout"><Info size={15} /><span>Mutually exclusive website signals cap the raw sum at 70. The app normalizes the observed raw score to 0–100 for the requested priority bands and shows both values in lead details.</span></div></section>
      <section className="surface-card settings-card"><div className="card-heading-row"><div><div className="card-kicker">DATA & RETENTION</div><h2>Minimal by default</h2></div><ShieldCheck size={18} className="muted-icon" /></div><div className="settings-feature-list"><div><CheckCircle2 size={16} /><span>Google Places business content stays in browser memory for this session only.</span></div><div><CheckCircle2 size={16} /><span>Local storage holds user-entered manual leads, their CRM fields, saved Google place IDs, and recent search terms. Google Places listing content is not cached.</span></div><div><CheckCircle2 size={16} /><span>Saved place details refresh only on request; the same place ID is not fetched twice in one app session.</span></div><div><CheckCircle2 size={16} /><span>CSV export includes user-entered manual lead details and CRM fields; Google Places business listing content remains excluded.</span></div></div><button className="text-button settings-link" type="button" onClick={() => onNavigate('Privacy Policy')}>Read the Privacy Policy <ArrowRight size={14} /></button></section>
      <section className="surface-card settings-card"><div className="card-heading-row"><div><div className="card-kicker">CONTACT SAFETY</div><h2>You stay in control</h2></div><MessageCircle size={18} className="muted-icon" /></div><div className="settings-feature-list"><div><CheckCircle2 size={16} /><span>No bulk email sending or automated WhatsApp messaging.</span></div><div><CheckCircle2 size={16} /><span>Email copy/open requires a user-entered, user-verified email and a confirmed contact basis; WhatsApp requires a public business phone and explicit per-lead opt-in.</span></div><div><CheckCircle2 size={16} /><span>“Do not contact” disables outreach, bulk selection is CRM-only, and closed/DNC leads leave follow-up suggestions.</span></div></div><button className="text-button settings-link" type="button" onClick={() => onNavigate('Terms')}>Review Terms <ArrowRight size={14} /></button></section>
    </div><div className="settings-readme-note"><FileText size={15} /><span>For full local setup, deployment, and API instructions, see the project README.md.</span></div>
  </div>;
}

function LegalPage({ type, onNavigate }) {
  const privacy = type === 'privacy';
  return <div className="page-stack legal-page"><PageHeading eyebrow="AGENCYOS POLICIES" title={privacy ? 'Privacy Policy' : 'Terms of Use'} description={privacy ? 'A plain-language summary of what this MVP does with workspace data.' : 'The rules and limits for this early-access prospecting workspace.'}><button className="button button-secondary" type="button" onClick={() => onNavigate('Settings')}><SettingsIcon size={15} /> Settings</button></PageHeading>
    <article className="surface-card legal-card"><div className="legal-updated"><ShieldCheck size={15} /> Last updated October 7, 2026 <span>·</span> MVP version</div>
      {privacy ? <>
        <section><h2>What AgencyOS does</h2><p>AgencyOS helps an agency research local businesses through the official Google Places API, qualify prospects from visible signals, draft outreach for review, and manage a simple CRM workflow. The optional sample dataset contains only fictional businesses and reserved example URLs.</p></section>
        <section><h2>Information and storage</h2><p>Google Places responses are held in browser memory for the active session and are not written to the AgencyOS server or browser storage. The browser stores manually entered leads, explicit user-entered overrides, CRM fields (status, notes, tags, follow-up dates, assigned service, estimate, a user-entered email and its verification/contact checks), saved Google place IDs, and recent user-entered search terms. Manual lead details are stored locally in this browser. Place IDs are exempt from Google Places caching restrictions; after a reload, a saved ID is a placeholder until you explicitly refresh its current listing details. Avoid putting sensitive personal information in notes.</p><p>CSV export contains manual/user-entered lead details, labeled CRM workflow fields, and Google place IDs, not Google Places business details. A user-initiated export creates a file on your device.</p></section>
        <section><h2>Website checks and external actions</h2><p>Website analysis makes a limited server-side request to the submitted public website, follows only a small number of safe redirects, and returns basic HTML signals. It does not attempt a visual audit. Email and WhatsApp buttons open your own applications only after you click; the MVP does not send messages, schedule sends, scrape Maps pages, or automate WhatsApp.</p></section>
        <section><h2>Credentials and service providers</h2><p>Google credentials are read by the server from environment variables and are never returned to the browser. Search requests are sent to Google Maps Platform. Your use of Google data is also subject to <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">Google Maps Platform terms</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google’s privacy practices</a>. This MVP does not include accounts, passwords, an email provider, or an external AI model.</p></section>
        <section><h2>Your responsibilities and choices</h2><p>You decide whether and how to contact a prospect. Confirm an appropriate legal basis for email and the recipient’s WhatsApp opt-in before using those channels. Use “Do not contact” when appropriate, honor opt-outs, and follow applicable privacy, marketing, and platform rules. You can clear local CRM data by clearing this site’s browser storage.</p></section>
        <section><h2>Contact and changes</h2><p>This policy is a product MVP summary, not legal advice. Replace it with a reviewed policy and a real contact address before public deployment. The workspace owner is responsible for publishing accurate contact information and updating this notice.</p></section>
      </> : <>
        <section><h2>Use of prospect data</h2><p>Use AgencyOS only for lawful, appropriate prospect research. You are responsible for confirming a lawful basis for outreach, honoring contact preferences and opt-outs, and complying with email, privacy, consumer-protection, and WhatsApp Business policies.</p></section>
        <section><h2>No scraping or automatic messaging</h2><p>Google-backed search uses official Google Places API endpoints when configured; manual lead entry and CSV import are local-only and do not make Places API calls. AgencyOS is not designed to scrape or automate Google Maps webpages. It does not send bulk email, automatically message WhatsApp numbers, bypass WhatsApp opt-in, or send follow-ups in the background. You must review every draft and explicitly choose whether to contact a prospect.</p></section>
        <section><h2>Google Maps Platform</h2><p>Google Places data is subject to <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">Google Maps Platform terms</a>, attribution, retention, and display requirements. Configure your Google Cloud project and API key securely, avoid storing restricted Google content, and review current provider policies before deployment or export use.</p></section>
        <section><h2>Website analysis</h2><p>Website checks are limited automated HTML observations, not legal, security, accessibility, visual design, or conversion guarantees. Dynamic content can be missed, and results should be reviewed before relying on them.</p></section>
        <section><h2>Availability and responsibility</h2><p>This MVP is provided as-is, without a guarantee that third-party APIs are configured or available. Scores and suggestions are decision support, not verified claims about a business or a promise of results. Verify important details and keep personal information out of notes.</p></section>
        <section><h2>Before public launch</h2><p>Have these terms and your privacy notices reviewed for your jurisdiction, add a real support contact, set up retention and deletion processes, and verify compliance with Google Maps Platform and messaging-provider terms.</p></section>
      </>}
      <div className="legal-disclaimer"><Info size={15} /><span>This short in-product notice is a practical MVP placeholder and is not a substitute for jurisdiction-specific legal review.</span></div>
    </article>
  </div>;
}

function EnrichmentEvidence({ label, field, value, crm, href = '' }) {
  if (!value) return null;
  const matches = (Array.isArray(crm.enrichmentEvidence) ? crm.enrichmentEvidence : []).filter((item) => item.field === field);
  const evidence = matches.find((item) => item.value === value) || matches[0];
  const safeLink = href ? safeHttpUrl(href) : '';
  return <div className="enrichment-fact">
    <span className="enrichment-fact-label">{label}</span>
    {safeLink ? <a className="enrichment-fact-value" href={safeLink} target="_blank" rel="noreferrer">{value}<ExternalLink size={11} /></a> : <strong className="enrichment-fact-value">{value}</strong>}
    <small>{evidence?.source || crm.enrichmentSource || 'Public website'} · {evidence?.confidence || crm.enrichmentConfidence || 'low'} confidence{evidence?.evidence ? ` · ${evidence.evidence}` : ''}</small>
  </div>;
}

function EnrichmentSection({ crm, onUpdate, onEnrich, enriching }) {
  const timestamp = crm.enrichmentTimestamp ? new Date(crm.enrichmentTimestamp) : null;
  const timestampLabel = timestamp && Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
    : '';
  const statusLabel = {
    complete: 'Enrichment complete', no_website: 'No website listed', no_public_details: 'No verified details found',
    unavailable: 'Website unavailable', not_enriched: 'Not enriched yet',
  }[crm.enrichmentStatus] || crm.enrichmentStatus;
  const socialLinks = Array.isArray(crm.enrichmentSocialLinks) ? crm.enrichmentSocialLinks : [];
  const services = Array.isArray(crm.enrichmentServices) ? crm.enrichmentServices : [];
  const useEmail = () => onUpdate({ email: crm.enrichmentEmail, emailVerifiedByUser: false, emailPermissionConfirmed: false });

  return <section className="drawer-section enrichment-section">
    <div className="drawer-section-heading"><div><div className="card-kicker">PUBLIC BUSINESS ENRICHMENT</div><h3>Enrich Lead</h3></div><button className="button button-secondary button-small" type="button" onClick={onEnrich} disabled={enriching}>{enriching ? <LoaderCircle size={13} className="spin" /> : <Search size={13} />}{enriching ? 'Enriching…' : crm.enrichmentTimestamp ? 'Check again' : 'Enrich Lead'}</button></div>
    <p className="enrichment-description">Checks the listed business website first, with safe public-page limits. If none is listed, optional website discovery runs only when configured. Results are cached for 24 hours; no Google Maps pages or private contact details are collected.</p>
    <div className="enrichment-status-row"><strong>{statusLabel}</strong>{timestampLabel && <span>{timestampLabel}</span>}{crm.enrichmentConfidence && <span>{crm.enrichmentConfidence} confidence</span>}{crm.enrichmentSource && <span>Source: {crm.enrichmentSource}</span>}</div>
    {crm.enrichmentStatus === 'not_enriched' && <div className="enrichment-empty">Only publicly listed business details are shown. Discovered emails remain separate until you choose to use one and verify it.</div>}
    {crm.enrichmentStatus === 'no_website' && <div className="enrichment-empty">No website was listed in OpenStreetMap. Optional Tavily discovery was not configured, so no search was made.</div>}
    {crm.enrichmentStatus === 'no_public_details' && <div className="enrichment-empty">No candidate website or supported public business details could be verified. Check the source manually.</div>}
    {crm.enrichmentStatus === 'unavailable' && <div className="enrichment-empty">{crm.enrichmentSource === 'tavily' ? 'Optional website discovery is unavailable. No candidate website was accepted.' : 'The public website could not be read. No contact details were inferred.'}</div>}
    <div className="enrichment-facts">
      <EnrichmentEvidence label="Business name" field="businessName" value={crm.enrichmentBusinessName} crm={crm} />
      <EnrichmentEvidence label="Discovered website" field="discoveredWebsite" value={crm.discoveredWebsite} href={crm.discoveredWebsite} crm={crm} />
      <EnrichmentEvidence label="Public business email" field="email" value={crm.enrichmentEmail} crm={crm} />
      {crm.enrichmentEmail && (crm.email
        ? <small className="enrichment-preserved-note">Existing CRM email was preserved. The discovered address is not used for outreach unless you replace it yourself.</small>
        : <button className="text-button enrichment-use-email" type="button" onClick={useEmail}>Use this email in CRM <ArrowRight size={13} /></button>)}
      <EnrichmentEvidence label="Public business phone" field="phone" value={crm.enrichmentPhone} crm={crm} />
      <EnrichmentEvidence label="Public WhatsApp link · not contacted" field="whatsappUrl" value={crm.enrichmentWhatsappUrl} crm={crm} />
      <EnrichmentEvidence label="Business address" field="address" value={crm.enrichmentAddress} crm={crm} />
      <EnrichmentEvidence label="Opening hours" field="openingHours" value={crm.enrichmentOpeningHours} crm={crm} />
      <EnrichmentEvidence label="Contact page" field="contactPage" value={crm.enrichmentContactPage} href={crm.enrichmentContactPage} crm={crm} />
      {socialLinks.map((url) => <EnrichmentEvidence key={url} label="Social profile" field="socialLinks" value={url} href={url} crm={crm} />)}
      {services.map((service) => <EnrichmentEvidence key={service} label="Publicly listed service" field="services" value={service} crm={crm} />)}
    </div>
    <div className="enrichment-privacy-note"><ShieldCheck size={13} /> Enrichment only gathers publicly listed business information. It does not contact the business or change your existing phone, email, or consent settings.</div>
  </section>;
}

function LeadDrawer({ lead, crm, onClose, onUpdate, onStatus, onMarkContacted, onRemove, onRefreshPlace, refreshingPlace, onAnalyze, analyzing, auditRevealed, onEnrich, enriching, onPitch }) {
  const closeDrawer = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  const score = scoreOpportunity(lead);
  const audit = lead.demo ? (auditRevealed ? lead.demoAudit : null) : getWebsiteAudit(lead);
  const dnc = crm.status === 'DO NOT CONTACT';
  const followUps = followUpPlan(lead, crm);
  const [openSection, setOpenSection] = useState('profile');

  const recordContacted = () => onMarkContacted();

  return (
    <div className="drawer-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onTouchEnd={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="lead-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-topbar"><span className="drawer-label"><span className="drawer-label-dot" /> LEAD PROFILE</span><button className="icon-button drawer-close-button" type="button" aria-label="Close lead profile" onClick={closeDrawer}><X size={18} /></button></div>
        <div className="drawer-scroll">
          <div className="drawer-hero">
            <div className="business-avatar business-avatar-hero">{initials(lead.name)}</div>
            <div className="drawer-hero-copy"><div className="drawer-hero-badges"><ModeBadge lead={lead} />{lead.businessStatus === 'OPERATIONAL' && <span className="operational-tag"><span /> Operational</span>}</div><h2 id="drawer-title">{lead.name}</h2><p>{lead.category} <span>·</span> {lead.city || lead.address || 'Location unavailable'}</p></div>
          </div>
          <div className="drawer-hero-actions"><button className="button button-primary" type="button" onClick={onPitch} disabled={dnc || lead.needsRefresh}><Sparkles size={15} /> Generate pitch</button><button className="button button-secondary" type="button" onClick={recordContacted} disabled={dnc}><Check size={15} /> Mark contacted</button></div>
          {lead.needsRefresh && <div className="refresh-place-callout"><Info size={15} /><div><strong>Only the Google Place ID was saved.</strong><span>Refresh this listing to view current details. Place content is kept in memory for this session only.</span></div><button className="button button-secondary button-small" type="button" onClick={onRefreshPlace} disabled={refreshingPlace}>{refreshingPlace ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}{refreshingPlace ? 'Refreshing…' : 'Refresh details'}</button></div>}

          <section className="score-detail-card">
            <div className="score-detail-top"><div><div className="card-kicker">OPPORTUNITY SCORE</div><div className="score-number-line"><strong>{score.score}</strong><span>/100</span><PriorityLabel tier={score.tier} /></div></div><div className={`score-ring score-ring-${score.tier}`} style={{ '--score-angle': `${score.score * 3.6}deg` }}><div>{score.score}<small>score</small></div></div></div>
            <div className="score-reason-label"><Sparkles size={12} /> Why this lead?</div><p className="score-reason">{opportunityReason(lead)}</p>
            <div className="drawer-evidence-list">{whyThisLead(lead).map((reason) => <div className={`drawer-evidence-item evidence-${reason.type}`} key={reason.key}><span>{reason.type === 'positive' ? <Check size={12} /> : <Info size={12} />}</span>{reason.text}</div>)}</div>
            <div className="drawer-service-recommendation"><Tag size={14} /><div><strong>Potential service · {recommendService(lead)[0].service}</strong><span>{recommendService(lead)[0].reason}</span></div>{SERVICES.includes(recommendService(lead)[0].service) && <button className="text-button" type="button" onClick={() => onUpdate({ assignedService: recommendService(lead)[0].service })}>Assign</button>}</div>
            <div className="raw-score-note"><Info size={13} /><span>{score.rawScore}/{score.maxRawScore} observed raw points, normalized to 0–100. Mutually exclusive website signals limit the raw maximum.</span></div>
            <div className="score-signal-list">{score.signals.map((signal) => <div className={`score-signal ${signal.active ? 'signal-active' : ''}`} key={signal.key}><span className="signal-check">{signal.active ? <Check size={11} /> : null}</span><span>{signal.label}</span><strong>{signal.active ? `+${signal.points}` : '—'}</strong></div>)}</div>
            <div className="demo-score-note"><ShieldCheck size={13} /> {lead.demo ? 'Fictional sample signals. Not a real business assessment.' : lead.source === 'manual' || lead.manualUserFields?.length ? 'User-entered details are not independently verified; missing fields remain unknown, not business weaknesses.' : 'Only returned fields and completed page checks contribute to this score.'}</div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-heading"><div><div className="card-kicker">PUBLIC PROFILE</div><h3>Business details</h3></div><button type="button" className="icon-button small-icon-button" onClick={() => setOpenSection(openSection === 'profile' ? '' : 'profile')} aria-label="Toggle business details"><ChevronDown size={15} className={openSection === 'profile' ? '' : 'chevron-collapsed'} /></button></div>
            {openSection === 'profile' && <div className="profile-facts">
              <div className="profile-fact"><MapPin size={15} /><div><span>{isUserProvidedManualField(lead, 'address') ? 'User-provided address' : 'Address'}</span><strong>{lead.needsRefresh ? 'Refresh to load current address' : lead.source === 'manual' ? lead.address || 'Not provided' : lead.address || lead.city || 'Not available'}</strong></div></div>
              <div className="profile-fact"><Star size={15} /><div><span>{isUserProvidedManualField(lead, 'rating') || isUserProvidedManualField(lead, 'reviews') ? 'Rating and review count' : isOsmLead(lead) ? 'Rating and review count (not provided by OpenStreetMap)' : 'Google rating and review count'}</span><strong>{leadRatingSummary(lead)}</strong></div></div>
              <div className="profile-fact"><Phone size={15} /><div><span>{isUserProvidedManualField(lead, 'phone') ? 'User-provided phone' : `Public business phone · ${listingSourceNoun(lead)} listing`}</span><strong>{lead.needsRefresh ? 'Refresh to load current public phone' : isUserProvidedManualField(lead, 'phone') ? lead.phone || 'Not provided' : lead.demo ? 'Not available in demo' : lead.phone || (isOsmLead(lead) ? 'Not listed in OpenStreetMap' : 'Not returned by Google')}</strong></div></div>
              <div className="profile-fact"><Globe2 size={15} /><div><span>{isUserProvidedManualField(lead, 'website') ? 'User-provided website' : `Website · ${listingSourceNoun(lead)} listing`}</span><strong>{lead.needsRefresh ? 'Refresh to load current website field' : lead.website ? safeHttpUrl(lead.website) ? (lead.demo ? `${new URL(safeHttpUrl(lead.website)).hostname} · sample only` : new URL(safeHttpUrl(lead.website)).hostname) : 'Invalid URL' : lead.source === 'manual' ? 'Not provided' : 'Not listed on profile'}</strong></div></div>
              {isUserProvidedManualField(lead, 'mapsUrl') && <div className="profile-fact"><MapPin size={15} /><div><span>Google Maps URL</span><strong>{lead.mapsUrl ? 'User-provided link' : 'Not provided'}</strong></div></div>}
              {lead.source === 'manual' && <div className="profile-fact"><Mail size={15} /><div><span>User-provided email</span><strong>{crm.email || 'Not provided'}</strong></div></div>}
              {isUserProvidedManualField(lead, 'instagram') && <div className="profile-fact"><ExternalLink size={15} /><div><span>Instagram</span><strong>{lead.instagram ? 'User-provided profile link' : 'Not provided'}</strong></div></div>}
              {isUserProvidedManualField(lead, 'facebook') && <div className="profile-fact"><ExternalLink size={15} /><div><span>Facebook</span><strong>{lead.facebook ? 'User-provided profile link' : 'Not provided'}</strong></div></div>}
              {safeHttpUrl(lead.website) && !lead.demo && <a className="profile-map-link" href={safeHttpUrl(lead.website)} target="_blank" rel="noreferrer"><Globe2 size={14} /> Open business website <ExternalLink size={12} /></a>}
              {safeHttpUrl(lead.mapsUrl) && <a className="profile-map-link" href={safeHttpUrl(lead.mapsUrl)} target="_blank" rel="noreferrer"><MapPin size={14} /> {isOsmLead(lead) ? 'Open on OpenStreetMap' : 'Open Google Maps'} <ExternalLink size={12} /></a>}
              {safeHttpUrl(lead.instagram) && <a className="profile-map-link" href={safeHttpUrl(lead.instagram)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Instagram profile <ExternalLink size={12} /></a>}
              {safeHttpUrl(lead.facebook) && <a className="profile-map-link" href={safeHttpUrl(lead.facebook)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Facebook profile <ExternalLink size={12} /></a>}
              {lead.placeId && !lead.demo && <div className="profile-place-id"><span>{isOsmLead(lead) ? 'OpenStreetMap object · retained reference' : 'Google Place ID · retained reference'}</span><code>{lead.placeId}</code></div>}
            </div>}
            {lead.source === 'google' && <GoogleDisclosure compact />}
            {lead.source === 'osm' && <OsmDisclosure />}
          </section>

          {isOsmLead(lead) && <EnrichmentSection crm={crm} onUpdate={onUpdate} onEnrich={onEnrich} enriching={enriching} />}

          {lead.website && <section className="drawer-section website-audit-section">
            <div className="drawer-section-heading"><div><div className="card-kicker">WEBSITE CHECK</div><h3>Potential opportunity</h3></div><button className="button button-secondary button-small" type="button" onClick={onAnalyze} disabled={analyzing}>{analyzing ? <LoaderCircle size={14} className="spin" /> : <Globe2 size={14} />}{analyzing ? 'Checking…' : lead.demo ? 'View demo check' : audit ? 'Analyze again' : 'Analyze website'}</button></div>
            {audit ? <AuditReport audit={audit} demo={lead.demo} showOrdering={isFoodBusiness(lead)} /> : <div className="audit-placeholder"><div className="audit-placeholder-icon"><Globe2 size={16} /></div><p>Check public page HTML for a mobile viewport declaration, clear CTA, contact links, and structured business details.</p><span>Limited technical check · not a visual audit</span></div>}
          </section>}

          <section className="drawer-section crm-section">
            <div className="drawer-section-heading"><div><div className="card-kicker">YOUR WORKFLOW</div><h3>CRM details</h3></div><span className="crm-local-badge"><ShieldCheck size={12} /> This browser</span></div>
            <div className="crm-grid-fields">
              <label className="field-group"><span>Status</span><div className="select-wrap"><select value={crm.status} onChange={(event) => onStatus(event.target.value)}>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}</select><ChevronDown size={14} /></div></label>
              <label className="field-group"><span>Assigned service</span><div className="select-wrap"><select value={crm.assignedService} onChange={(event) => onUpdate({ assignedService: event.target.value })}>{SERVICES.map((service) => <option key={service} value={service}>{service}</option>)}</select><ChevronDown size={14} /></div></label>
              <label className="field-group"><span>Last contacted</span><input className="field-input" type="date" value={crm.lastContacted} onChange={(event) => { const value = event.target.value; onUpdate({ lastContacted: value, lastContactedAt: '', followUpAnchorDate: value, followUpStep: value ? 1 : 0, nextFollowUp: value ? addDays(value, 3) : '' }); }} /></label>
              <label className="field-group"><span>Next follow-up</span><input className="field-input" type="date" value={crm.nextFollowUp} onChange={(event) => onUpdate({ nextFollowUp: event.target.value })} /></label>
              <label className="field-group"><span>Estimated deal value (₹)</span><input className="field-input" inputMode="numeric" type="number" min="0" value={crm.estimatedDealValue} onChange={(event) => onUpdate({ estimatedDealValue: event.target.value })} placeholder="Not set" /></label>
              <label className="field-group"><span>Business email <small>user-entered, not from Google</small></span><input className="field-input" type="email" value={crm.email} onChange={(event) => onUpdate({ email: event.target.value, emailVerifiedByUser: false, emailPermissionConfirmed: false })} placeholder={lead.source === 'manual' ? 'Not provided' : 'Enter a business email'} maxLength={254} /></label>
            </div>
            <label className={`consent-row email-verified-row ${dnc || !crm.email ? 'consent-disabled' : ''}`}><input type="checkbox" checked={crm.emailVerifiedByUser} disabled={dnc || !crm.email} onChange={(event) => onUpdate({ emailVerifiedByUser: event.target.checked, ...(event.target.checked ? {} : { emailPermissionConfirmed: false }) })} /><span className="consent-check" /><span><strong>{crm.emailVerifiedByUser ? 'Business email verified by you' : 'I verified this business email'}</strong><small>Email is user-entered and {crm.emailVerifiedByUser ? 'marked verified by you.' : 'unverified until you confirm it.'}</small></span></label>
            <label className="field-group tags-field"><span>Tags <small>Comma-separated labels</small></span><input className="field-input" value={crm.tags.join(', ')} onChange={(event) => onUpdate({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20) })} placeholder="e.g. Pune, priority, referral" maxLength={400} /></label>
            <label className="field-group notes-field"><span>Notes <small>Keep sensitive personal data out.</small></span><textarea value={crm.notes} onChange={(event) => onUpdate({ notes: event.target.value })} maxLength={5000} rows={3} placeholder={lead.source === 'manual' ? 'Not provided' : 'Add context for your next conversation…'} /></label>
          </section>

          <section className="drawer-section contact-preferences-section">
            <div className="drawer-section-heading"><div><div className="card-kicker">CONTACT PREFERENCES</div><h3>Confirm before contacting</h3></div><ShieldCheck size={16} className="muted-icon" /></div>
            <label className={`consent-row ${dnc ? 'consent-disabled' : ''}`}><input type="checkbox" checked={crm.emailPermissionConfirmed} disabled={dnc} onChange={(event) => onUpdate({ emailPermissionConfirmed: event.target.checked })} /><span className="consent-check" /><span><strong>Email contact basis confirmed</strong><small>Confirm a lawful basis and honor any opt-out.</small></span></label>
            <label className={`consent-row ${dnc ? 'consent-disabled' : ''}`}><input type="checkbox" checked={crm.whatsappOptInConfirmed} disabled={dnc} onChange={(event) => onUpdate({ whatsappOptInConfirmed: event.target.checked })} /><span className="consent-check" /><span><strong>WhatsApp opt-in confirmed</strong><small>Required before opening a WhatsApp draft.</small></span></label>
            {dnc && <div className="dnc-notice"><ShieldCheck size={14} /> Do Not Contact is active. Copy and email/WhatsApp actions are disabled.</div>}
          </section>

          <section className="drawer-section cadence-section">
            <div className="drawer-section-heading"><div><div className="card-kicker">SUGGESTED FOLLOW-UP</div><h3>Day 0 · Day 3 · Day 7 · Day 14</h3></div><Clock3 size={16} className="muted-icon" /></div>
            <div className="cadence-rows">{followUps.map((item) => <div className="cadence-row" key={item.day}><span className={`cadence-bullet ${item.completed ? 'cadence-complete' : ''}`}>{item.completed ? <Check size={10} /> : null}</span><strong>{item.day}</strong><span>{item.title}</span><time>{formatDate(item.date, { day: 'numeric', month: 'short', year: undefined })}</time>{!dnc && !item.completed && item.day !== 'Day 0' && crm.nextFollowUp !== item.date && <button type="button" className="cadence-set-button" onClick={() => onUpdate({ nextFollowUp: item.date })}>Set date</button>}</div>)}</div>
            <div className="cadence-foot"><Info size={13} /> Dates are suggestions only. AgencyOS will never send a follow-up automatically.</div>
          </section>
        </div>
        <div className="drawer-bottom-bar"><button className="button button-quiet drawer-remove-button" type="button" onClick={onRemove} title="Delete this lead and its saved CRM details"><Trash2 size={14} /> Delete lead</button><button className="button button-secondary drawer-close-button" type="button" onClick={closeDrawer}>Close</button><button className="button button-primary" type="button" onClick={onPitch} disabled={dnc || lead.needsRefresh}><Sparkles size={15} /> Generate pitch</button></div>
      </aside>
    </div>
  );
}

function AuditReport({ audit, demo, showOrdering = false }) {
  const checks = [
    { label: 'Mobile viewport declaration', present: audit.mobileViewportDetected, detail: 'This checks for a viewport meta tag, not actual mobile rendering.' },
    { label: 'Clear CTA in page links/buttons', present: audit.ctaDetected, detail: 'Only visible link/button labels and selected paths were inspected.' },
    { label: 'Obvious contact flow', present: audit.contactFlowDetected, detail: 'Checks for a phone, email, contact, or booking link.' },
    { label: 'WhatsApp entry point', present: audit.whatsappFlowDetected, detail: 'Checks for a WhatsApp link or link/button labelled WhatsApp.' },
    ...(showOrdering && typeof audit.onlineOrderingDetected === 'boolean' ? [{ label: 'Online-ordering link', present: audit.onlineOrderingDetected, detail: 'Checks fetched public HTML link text and URLs only; no ordering flow was tested.' }] : []),
    { label: 'Structured business contact details', present: audit.structuredContactInfoDetected, detail: 'Checks for an address element or contact fields in JSON-LD.' },
    { label: 'Page title', present: audit.titleDetected, detail: 'A non-empty HTML title element was detected.' },
  ];
  const gaps = checks.filter((check) => check.present === false);
  return (
    <div className="audit-report">
      <div className="audit-report-top"><span className={demo ? 'demo-audit-tag' : 'live-audit-tag'}>{demo ? 'DEMO PREVIEW · NOT LIVE' : 'LIMITED HTML CHECK'}</span>{!demo && audit.finalUrl && <a href={audit.finalUrl} target="_blank" rel="noreferrer" aria-label="Open analyzed website"><ExternalLink size={13} /></a>}</div>
      <div className="audit-check-list">{checks.map((check) => <div className="audit-check-row" key={check.label}><span className={`audit-check-icon ${check.present ? 'audit-positive' : 'audit-caution'}`}>{check.present ? <Check size={12} /> : <Info size={12} />}</span><div><strong>{check.label}</strong><small>{check.present ? 'Detected in fetched HTML' : 'Not detected in fetched HTML'} · {check.detail}</small></div></div>)}</div>
      <div className="audit-opportunity"><strong>Potential opportunity</strong>{gaps.length ? <ul>{gaps.slice(0, 4).map((gap) => <li key={gap.label}>{gap.label} was not detected in the fetched page HTML.</li>)}</ul> : <p>No obvious gaps were detected by these limited checks. This does not confirm the page is conversion-ready.</p>}</div>
      <div className="audit-caveat"><Info size={13} /> Visual freshness, responsive behavior, accessibility, and content loaded by scripts are not assessed. {demo ? 'All sample signals are fictional.' : 'Automated HTML checks can miss dynamic content.'}</div>
    </div>
  );
}

function OutreachModal({ lead, crm, onClose, onToast, onMarkContacted, onReviewLead }) {
  const draft = useMemo(() => buildOutreach(lead), [lead]);
  const [tab, setTab] = useState('email');
  const [subject, setSubject] = useState(draft.subject);
  const [emailBody, setEmailBody] = useState(draft.emailBody);
  const [whatsappBody, setWhatsappBody] = useState(draft.whatsappBody);
  const isDnc = crm.status === 'DO NOT CONTACT';
  const emailValidation = validateOutreachContact('email', lead, crm);
  const whatsappValidation = validateOutreachContact('whatsapp', lead, crm);
  const emailAllowed = emailValidation.allowed;
  const phoneDigits = safePhoneDigits(lead.internationalPhoneNumber || lead.phone);
  const whatsappPhoneDigits = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
  const whatsappAllowed = whatsappValidation.allowed && Boolean(whatsappPhoneDigits);
  const whatsappDraftAllowed = !isDnc && !lead.demo && !lead.needsRefresh;
  const whatsappAppAllowed = whatsappDraftAllowed && Boolean(whatsappPhoneDigits);
  const emailHref = `mailto:${encodeURIComponent(crm.email || '').replaceAll('%40', '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  // Use WhatsApp's universal HTTPS link: on mobile it hands off to the installed app;
  // otherwise it falls back to WhatsApp Web instead of leaving the site on a blank scheme page.
  const whatsappHref = whatsappAppAllowed ? `https://wa.me/${whatsappPhoneDigits}?text=${encodeURIComponent(whatsappBody)}` : '';
  const whatsappOpenReason = whatsappAppAllowed ? 'WhatsApp will open with the message prefilled. Review it and tap Send yourself.' : 'Add a valid phone number to open WhatsApp.';

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    onToast(`${label} copied. Review before sending.`);
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} onTouchEnd={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="outreach-modal" role="dialog" aria-modal="true" aria-labelledby="outreach-title">
        <div className="modal-header"><div><div className="card-kicker">PERSONALIZED OUTREACH</div><h2 id="outreach-title">A message that sounds like you.</h2><p>Drafted from available public details. Edit it freely before using.</p></div><button className="icon-button modal-close-button" type="button" aria-label="Close pitch composer" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}><X size={18} /></button></div>
        <div className="pitch-recipient"><div className="business-avatar">{initials(lead.name)}</div><div><strong>{lead.name}</strong><span>{lead.category} · {lead.city || lead.address || 'Location not returned'}</span></div><ModeBadge lead={lead} /></div>
        <div className="pitch-recipient-links">{!lead.demo && safeHttpUrl(lead.website) && <a href={safeHttpUrl(lead.website)} target="_blank" rel="noreferrer"><Globe2 size={13} /> Open website <ExternalLink size={11} /></a>}{!lead.demo && safeHttpUrl(lead.mapsUrl) && <a href={safeHttpUrl(lead.mapsUrl)} target="_blank" rel="noreferrer"><MapPin size={13} /> {isOsmLead(lead) ? 'OpenStreetMap' : 'Google Maps'} <ExternalLink size={11} /></a>}</div>
        {lead.source === 'google' && <GoogleDisclosure compact />}
        {lead.source === 'osm' && <OsmDisclosure />}
        <div className="pitch-tabs"><button type="button" className={tab === 'email' ? 'pitch-tab active' : 'pitch-tab'} onClick={() => setTab('email')}><Mail size={15} /> Email draft</button><button type="button" className={tab === 'whatsapp' ? 'pitch-tab active' : 'pitch-tab'} onClick={() => setTab('whatsapp')}><MessageCircle size={15} /> WhatsApp draft</button></div>
        <div className={`outreach-contact-status ${tab === 'email' ? (emailAllowed ? 'contact-basis-ready' : 'contact-basis-blocked') : (whatsappDraftAllowed ? 'contact-basis-ready' : 'contact-basis-blocked')}`}><ShieldCheck size={14} /><span>{tab === 'email' ? emailAllowed ? 'Email address is user-entered, verified by you, and contact basis confirmed.' : emailValidation.reason : whatsappDraftAllowed ? 'WhatsApp draft is ready to copy. Opening WhatsApp requires a valid business phone number.' : whatsappValidation.reason}{tab === 'whatsapp' && lead.phone && <small>Phone source: {isUserProvidedManualField(lead, 'phone') ? 'user-entered business number.' : lead.demo ? 'fictional demo sample.' : isOsmLead(lead) ? 'public business number from OpenStreetMap.' : lead.source === 'gemini' ? 'public business number from Google Maps grounding.' : 'public business number from Google Places.'}</small>}</span></div>
        {tab === 'email' ? <div className="pitch-editor"><label className="field-group"><span>Subject</span><input className="field-input" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} /></label><label className="field-group"><span>Email body</span><textarea rows={10} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} maxLength={4000} /></label><div className="pitch-editor-foot"><span>{emailBody.length} / 4,000 characters</span><button className="text-button" type="button" onClick={() => copy(`${subject}\n\n${emailBody}`, 'Email draft')} disabled={!emailAllowed}><Copy size={14} /> Copy email</button></div></div> : <div className="pitch-editor"><label className="field-group"><span>WhatsApp message</span><textarea rows={7} value={whatsappBody} onChange={(event) => setWhatsappBody(event.target.value)} maxLength={1500} /></label><div className="pitch-editor-foot"><span>{whatsappBody.length} / 1,500 characters</span><button className="text-button" type="button" onClick={() => copy(whatsappBody, 'WhatsApp draft')} disabled={!whatsappDraftAllowed}><Copy size={14} /> Copy message</button></div></div>}
        <div className="pitch-evidence"><ShieldCheck size={14} /><span>{lead.demo ? 'Fictional demo details. The sample cannot be contacted.' : lead.source === 'manual' || lead.manualUserFields?.length ? 'Draft uses details entered by you and any completed page check. User-entered claims are not independently verified.' : 'Draft uses only returned listing details and any completed page check. No unsupported business claims are added.'}</span></div>
        {isDnc && <div className="dnc-notice modal-dnc"><ShieldCheck size={14} /> Do Not Contact is active. Draft copy and channel actions are disabled.</div>}
        <div className="modal-actions">
          {tab === 'email' ? <>
            <button className="button button-secondary" type="button" onClick={() => copy(`${subject}\n\n${emailBody}`, 'Email draft')} disabled={!emailAllowed}><Copy size={15} /> Copy draft</button>
            {emailAllowed ? <a className="button button-primary" href={emailHref}><Mail size={15} /> Open email app <ArrowUpRight size={14} /></a> : <button className="button button-primary" type="button" disabled title="Add a valid business email and confirm the appropriate contact basis in Lead details."><Mail size={15} /> Open email app</button>}
          </> : <>
            <button className="button button-secondary" type="button" onClick={() => copy(whatsappBody, 'WhatsApp draft')} disabled={!whatsappDraftAllowed}><Copy size={15} /> Copy draft</button>
            {whatsappAppAllowed ? <a className="button button-whatsapp" href={whatsappHref}><MessageCircle size={15} /> Open WhatsApp app <ArrowUpRight size={14} /></a> : <button className="button button-whatsapp" type="button" disabled title={whatsappOpenReason}><MessageCircle size={15} /> Open WhatsApp app</button>}
          </>}
          <button type="button" className="button button-secondary mark-contacted-button" onClick={onMarkContacted} disabled={isDnc || lead.demo}><Check size={14} /> Mark as Contacted</button>
          <button type="button" className="modal-review-link" onClick={onReviewLead}>Review contact details <ArrowRight size={14} /></button>
        </div>
        <div className="manual-send-note"><Info size={14} /><span>{tab === 'email' ? 'Opening your email app does not send a message. You review and send it yourself.' : 'Click Open WhatsApp once to open the installed WhatsApp app with the message prefilled. Then review it and tap Send yourself; AgencyOS never sends automatically.'}</span></div>
      </section>
    </div>
  );
}

// Top-level shell: the public REVOLTZ AI site lives at "/", the AgencyOS
// workspace at "/agencyos". Both share one bundle; no server routes changed.
function App() {
  const path = useRouterPath();
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [path]);

  // The public GitHub Pages build is intentionally website-only. AgencyOS
  // remains available in local/self-hosted builds for internal use.
  const publicSiteOnly = import.meta.env.VITE_PUBLIC_SITE_ONLY === 'true';
  return !publicSiteOnly && isAppPath(path) ? <AgencyOSApp /> : <RevoltzSite />;
}

export default App;
