'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ServerStatus } from '@/lib/server-status';
import type { SearchCandidate } from '@/lib/services/lead-search';
import type { SearchQueryRecord } from '@/lib/types';
import { apiFetch, describeError } from '@/lib/client/api';
import { Button, Field, Select, TextInput, Toggle } from '@/components/ui/controls';
import { Badge, Card, CardBody, CardHeader, GoogleAttribution, ScoreRing, WebsiteLink } from '@/components/ui/display';
import { Banner, EmptyState, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { cn, formatNumber } from '@/lib/utils';
import { BAND_META } from '@/lib/scoring/opportunity';

interface Props {
  status: ServerStatus;
  defaultCity: string;
  campaigns: { id: string; name: string; status: string }[];
  recentSearches: { industry: string; city: string; mode: string; executedAt: string }[];
  savedLeadCount: number;
  industrySuggestions: string[];
}

const EXAMPLE_SEARCHES: { industry: string; city: string }[] = [
  { industry: 'Restaurants', city: 'Pune' },
  { industry: 'Dental clinics', city: 'Pune' },
  { industry: 'CA firms', city: 'Pune' },
  { industry: 'Gyms', city: 'Pune' },
  { industry: 'Salons', city: 'Pune' },
  { industry: 'Real estate agencies', city: 'Pune' },
  { industry: 'Cloud kitchens', city: 'Pune' },
];

export function FindLeadsPanel({ status, defaultCity, campaigns, recentSearches, savedLeadCount, industrySuggestions }: Props) {
  const toast = useToast();
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [radiusKm, setRadiusKm] = useState<number | ''>('');
  const [maxResults, setMaxResults] = useState(20);
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [campaignId, setCampaignId] = useState('');
  const [useDemo, setUseDemo] = useState(!status.googleConfigured);
  const [locating, setLocating] = useState(false);

  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[] | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [query, setQuery] = useState<SearchQueryRecord | null>(null);
  const [mode, setMode] = useState<'live' | 'demo' | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const demoLocked = !status.googleConfigured;

  const allSelected = useMemo(
    () => Boolean(candidates?.length) && selected.size === candidates?.length,
    [candidates, selected],
  );

  function toggle(placeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }

  function toggleAll() {
    if (!candidates) return;
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.place.placeId)));
  }

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.push({ tone: 'warn', title: 'Geolocation unavailable in this browser.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
        toast.push({ tone: 'success', title: 'Coordinates captured', description: 'The radius will now bias your search around this point.' });
      },
      (err) => {
        setLocating(false);
        toast.push({ tone: 'error', title: 'Could not get your location', description: err.message });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    );
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (industry.trim().length < 2 || city.trim().length < 2) {
      setError('Enter both an industry/category and a city or locality.');
      return;
    }
    setError(null);
    setLoading(true);
    setCandidates(null);
    setNotices([]);
    try {
      const res = await apiFetch<{
        candidates: SearchCandidate[];
        notices: string[];
        query: SearchQueryRecord;
        mode: 'live' | 'demo';
        textQuery: string;
      }>('/api/leads/search', {
        method: 'POST',
        body: JSON.stringify({
          industry: industry.trim(),
          city: city.trim(),
          radiusKm: radiusKm === '' ? null : Number(radiusKm),
          maxResults,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          demo: useDemo,
        }),
      });
      setCandidates(res.candidates);
      setNotices(res.notices);
      setQuery(res.query);
      setMode(res.mode);
      setSelected(new Set(res.candidates.map((c) => c.place.placeId)));
      toast.push({
        tone: res.candidates.length ? 'success' : 'info',
        title: `${res.candidates.length} result${res.candidates.length === 1 ? '' : 's'} · ${res.mode === 'demo' ? 'Demo Mode' : 'Google Places API'}`,
        description: `Query sent to Google: "${res.textQuery}"`,
      });
    } catch (err) {
      const message = describeError(err);
      setError(message);
      setNotices([]);
      toast.push({ tone: 'error', title: 'Search failed', description: message });
    } finally {
      setLoading(false);
    }
  }

  async function importSelected() {
    if (!candidates || selected.size === 0) return;
    const picked = candidates.filter((c) => selected.has(c.place.placeId));
    setImporting(true);
    try {
      const res = await apiFetch<{ created: number; refreshed: number; notice: string }>('/api/leads/import', {
        method: 'POST',
        body: JSON.stringify({
          candidates: picked.map((c) => ({ place: c.place })),
          query,
          campaignId: campaignId || null,
          isDemo: mode === 'demo',
        }),
      });
      toast.push({ tone: 'success', title: 'Leads saved', description: res.notice });
      setSelected(new Set());
    } catch (err) {
      toast.push({ tone: 'error', title: 'Import failed', description: describeError(err) });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Search form */}
      <Card className="lg:col-span-4 xl:col-span-3">
        <CardHeader title="Search local businesses" subtitle="Official Google Places API (New) · Text Search" icon="search" />
        <CardBody>
          <form onSubmit={search} className="space-y-4">
            <Field label="Industry / category" required>
              <TextInput
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Dental clinics"
                autoComplete="off"
                list="industry-suggestions"
              />
              <datalist id="industry-suggestions">
                {industrySuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>

            <Field label="City / locality" required>
              <TextInput value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" autoComplete="off" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Radius (km)" hint={radiusKm && !latitude ? 'Needs coordinates' : undefined}>
                <TextInput
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="5"
                />
              </Field>
              <Field label="Max results" hint="Google caps Text Search at 20">
                <Select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))}>
                  {[5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude (optional)">
                <TextInput value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="18.5204" inputMode="decimal" />
              </Field>
              <Field label="Longitude (optional)">
                <TextInput value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="73.8567" inputMode="decimal" />
              </Field>
            </div>

            <Button type="button" variant="ghost" size="xs" icon="mapPin" onClick={useMyLocation} loading={locating}>
              Use my location
            </Button>

            {campaigns.length > 0 ? (
              <Field label="Attach to campaign" hint="Optional — imported leads join this campaign's follow-up sequence.">
                <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">No campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <div className="panel-flat p-3">
              <Toggle
                checked={useDemo}
                onChange={(next) => setUseDemo(demoLocked ? true : next)}
                disabled={demoLocked}
                label="Demo Mode"
                description={
                  demoLocked
                    ? 'Forced on: no GOOGLE_PLACES_API_KEY on this server.'
                    : 'Use the fictional demo dataset instead of calling Google.'
                }
              />
            </div>

            {error ? <Banner tone="error" title="Search error">{error}</Banner> : null}

            <Button type="submit" variant="primary" block loading={loading} icon="search">
              {loading ? 'Searching…' : demoLocked || useDemo ? 'Search demo data' : 'Search Google Places'}
            </Button>

            <p className="text-[11px] leading-relaxed text-ink-500">
              Field mask requests only the fields AgencyOS displays (id, name, address, phone, website, rating, review count, Maps URL). No wildcard
              masks, no Google Maps page scraping.
            </p>
          </form>
        </CardBody>
      </Card>

      {/* Results */}
      <div className="space-y-4 lg:col-span-8 xl:col-span-9">
        <Card>
          <CardHeader
            title="Example searches"
            subtitle="One click fills the form — useful for a quick demo"
            icon="sparkles"
            action={
              <span className="badge-neutral">
                <Icon name="leads" size={11} />
                {savedLeadCount} saved
              </span>
            }
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_SEARCHES.map((example) => (
                <button
                  key={example.industry}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setIndustry(example.industry);
                    setCity(example.city);
                  }}
                >
                  {example.industry} in {example.city}
                </button>
              ))}
            </div>
            {recentSearches.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Recent:</span>
                {recentSearches.map((s, i) => (
                  <button
                    key={`${s.industry}-${i}`}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setIndustry(s.industry);
                      setCity(s.city);
                    }}
                  >
                    {s.industry} · {s.city}
                  </button>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Results"
            subtitle={
              candidates
                ? `${candidates.length} place${candidates.length === 1 ? '' : 's'} · ${mode === 'demo' ? 'demo dataset' : 'Google Places API (New)'}`
                : 'Run a search to see candidates'
            }
            icon="target"
            action={
              candidates && candidates.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="ghost" onClick={toggleAll}>
                    {allSelected ? 'Clear selection' : 'Select all'}
                  </Button>
                  <Button size="xs" variant="primary" icon="plus" onClick={importSelected} loading={importing} disabled={selected.size === 0}>
                    Import {selected.size || ''} lead{selected.size === 1 ? '' : 's'}
                  </Button>
                </div>
              ) : null
            }
          />
          <CardBody className="space-y-3">
            {notices.map((notice, i) => (
              <Banner key={i} tone={mode === 'demo' ? 'warn' : 'info'}>
                {notice}
              </Banner>
            ))}

            {!candidates ? (
              <EmptyState
                icon="search"
                title={status.googleConfigured ? 'Search Google Places for prospects' : 'Demo Mode is active'}
                description={
                  status.googleConfigured
                    ? 'Results are returned as candidates first — you choose which ones to save as leads.'
                    : 'No Google Places key is configured on this server, so searches return the fictional demo dataset. Add GOOGLE_PLACES_API_KEY to go live.'
                }
              />
            ) : candidates.length === 0 ? (
              <EmptyState icon="info" title="No matches" description="Try a broader category, a different locality, or a larger radius." />
            ) : (
              <div className="table-wrap">
                <table className="w-full border-collapse">
                  <thead className="border-b border-white/[0.07] bg-ink-900/60">
                    <tr>
                      <th className="th w-8">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all results" className="accent-brand-500" />
                      </th>
                      <th className="th">Business</th>
                      <th className="th">Category</th>
                      <th className="th hidden md:table-cell">Rating</th>
                      <th className="th hidden lg:table-cell">Website</th>
                      <th className="th hidden lg:table-cell">Phone</th>
                      <th className="th">Score</th>
                      <th className="th" />
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => {
                      const band = candidate.previewBand;
                      const checked = selected.has(candidate.place.placeId);
                      return (
                        <tr key={candidate.place.placeId} className={cn('row-hover border-b border-white/[0.05] last:border-0', checked && 'bg-brand-500/[0.06]')}>
                          <td className="td">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(candidate.place.placeId)}
                              aria-label={`Select ${candidate.place.displayName}`}
                              className="accent-brand-500"
                            />
                          </td>
                          <td className="td">
                            <div className="max-w-[240px]">
                              <p className="truncate text-[13px] font-medium text-ink-100" title={candidate.place.displayName}>
                                {candidate.place.displayName}
                              </p>
                              <p className="truncate text-[11px] text-ink-400" title={candidate.place.formattedAddress ?? ''}>
                                {candidate.place.formattedAddress ?? 'Address not returned'}
                              </p>
                              {candidate.existingLeadId ? (
                                <Link href={`/leads/${candidate.existingLeadId}`} className="mt-1 inline-flex items-center gap-1 text-[10px] text-brand-300 hover:underline">
                                  <Icon name="check" size={10} /> Already saved ({candidate.existingStatus}) — importing refreshes it
                                </Link>
                              ) : null}
                            </div>
                          </td>
                          <td className="td text-xs text-ink-300">{candidate.place.primaryType ?? '—'}</td>
                          <td className="td hidden md:table-cell">
                            <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                              {candidate.place.rating !== null ? (
                                <>
                                  <Icon name="star" size={11} className="text-amber-300" strokeWidth={1.4} />
                                  {candidate.place.rating.toFixed(1)}
                                </>
                              ) : (
                                '—'
                              )}
                              <span className="text-ink-500">({formatNumber(candidate.place.userRatingCount)})</span>
                            </span>
                          </td>
                          <td className="td hidden lg:table-cell">
                            <WebsiteLink url={candidate.place.websiteUri} />
                          </td>
                          <td className="td hidden lg:table-cell text-xs text-ink-300">
                            {candidate.place.internationalPhoneNumber ?? candidate.place.nationalPhoneNumber ?? <span className="text-ink-500">—</span>}
                          </td>
                          <td className="td">
                            <span className="inline-flex items-center gap-2">
                              <ScoreRing score={candidate.previewScore ?? 0} size={34} strokeWidth={3.5} />
                              {band ? (
                                <span className="text-[11px] text-ink-400" title={candidate.previewReason ?? undefined}>
                                  {BAND_META[band].emoji} {BAND_META[band].label}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="td text-right">
                            {candidate.existingLeadId ? (
                              <Link href={`/leads/${candidate.existingLeadId}`} className="btn-ghost btn-xs">
                                Open <Icon name="chevronRight" size={11} />
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {candidates && candidates.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <GoogleAttribution />
                <div className="flex items-center gap-2">
                  <Badge tone="neutral" icon="shield">
                    Preview only — nothing saved yet
                  </Badge>
                  <Link href="/leads" className="btn-secondary btn-xs">
                    Go to Leads
                  </Link>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
