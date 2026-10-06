/** CSV helpers — export of the user's own prospecting workflow data. */

import type { Campaign, Lead } from './types';
import { SERVICE_LABELS, STATUS_LABELS } from './types';
import { daysBetween, formatDateTime, prettyHostname } from './utils';

export interface CsvColumn<T> {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvValue(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

export const LEAD_CSV_COLUMNS: CsvColumn<Lead>[] = [
  { key: 'business', header: 'Business', value: (l) => l.place.displayName },
  { key: 'category', header: 'Category', value: (l) => l.place.primaryType ?? '' },
  { key: 'location', header: 'Location', value: (l) => l.place.formattedAddress ?? '' },
  { key: 'city', header: 'City', value: (l) => l.query?.city ?? '' },
  { key: 'rating', header: 'Rating', value: (l) => l.place.rating ?? '' },
  { key: 'reviews', header: 'Reviews', value: (l) => l.place.userRatingCount ?? '' },
  { key: 'website', header: 'Website', value: (l) => l.place.websiteUri ?? '' },
  { key: 'phone', header: 'Phone', value: (l) => l.place.internationalPhoneNumber ?? l.place.nationalPhoneNumber ?? '' },
  { key: 'email', header: 'Email', value: (l) => l.email ?? '' },
  { key: 'score', header: 'Opportunity Score', value: (l) => l.score?.score ?? '' },
  { key: 'band', header: 'Priority', value: (l) => l.score?.band ?? '' },
  { key: 'status', header: 'Status', value: (l) => STATUS_LABELS[l.status] },
  { key: 'service', header: 'Assigned Service', value: (l) => (l.crm.assignedService ? SERVICE_LABELS[l.crm.assignedService] : '') },
  { key: 'dealValue', header: 'Estimated Deal Value', value: (l) => l.crm.estimatedDealValue ?? '' },
  { key: 'currency', header: 'Currency', value: (l) => l.crm.currency },
  { key: 'owner', header: 'Owner', value: (l) => l.crm.owner ?? '' },
  { key: 'campaign', header: 'Campaign', value: (l) => l.campaignId ?? '' },
  { key: 'lastContacted', header: 'Last Contacted', value: (l) => (l.crm.lastContactedAt ? formatDateTime(l.crm.lastContactedAt) : '') },
  { key: 'nextFollowUp', header: 'Next Follow-up', value: (l) => l.crm.nextFollowUpAt ?? '' },
  { key: 'siteScore', header: 'Website Score', value: (l) => (l.analysis?.fetched ? l.analysis.siteScore : '') },
  { key: 'siteQuality', header: 'Website Quality', value: (l) => (l.analysis?.fetched ? l.analysis.siteQuality : '') },
  { key: 'emailSubject', header: 'Email Subject', value: (l) => l.outreach?.emailSubject ?? '' },
  { key: 'notes', header: 'Notes', value: (l) => l.crm.notes },
  { key: 'tags', header: 'Tags', value: (l) => l.tags.join(' ') },
  { key: 'placeId', header: 'Place ID', value: (l) => l.place.placeId },
  { key: 'mapsUrl', header: 'Google Maps URL', value: (l) => l.place.googleMapsUri ?? '' },
  { key: 'dataSource', header: 'Data Source', value: (l) => (l.isDemo ? 'demo' : l.place.source) },
  { key: 'dataAgeDays', header: 'Data Age (days)', value: (l) => daysBetween(l.place.retrievedAt) },
  { key: 'createdAt', header: 'Created', value: (l) => formatDateTime(l.createdAt) },
];

export function leadsToCsv(leads: Lead[], campaigns: Campaign[] = []): string {
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const rows = leads.map((l) => ({ ...l, campaignId: l.campaignId ? campaignName.get(l.campaignId) ?? l.campaignId : l.campaignId }));
  return toCsv(rows as Lead[], LEAD_CSV_COLUMNS);
}

export const CAMPAIGN_CSV_COLUMNS: CsvColumn<Campaign & { leadCount: number; contacted: number; replies: number; won: number; pipelineValue: number }>[] = [
  { key: 'name', header: 'Campaign', value: (c) => c.name },
  { key: 'status', header: 'Status', value: (c) => c.status },
  { key: 'service', header: 'Service', value: (c) => (c.service ? SERVICE_LABELS[c.service] : '') },
  { key: 'leads', header: 'Leads', value: (c) => c.leadCount },
  { key: 'contacted', header: 'Contacted', value: (c) => c.contacted },
  { key: 'replies', header: 'Replies', value: (c) => c.replies },
  { key: 'won', header: 'Won', value: (c) => c.won },
  { key: 'pipelineValue', header: 'Pipeline Value', value: (c) => c.pipelineValue },
  { key: 'description', header: 'Description', value: (c) => c.description },
  { key: 'created', header: 'Created', value: (c) => formatDateTime(c.createdAt) },
];

/** Simple CSV for the "raw place snapshot" view (handy for spreadsheets). */
export function leadWebsiteDomains(leads: Lead[]): string[] {
  return leads.map((l) => prettyHostname(l.place.websiteUri)).filter(Boolean);
}
