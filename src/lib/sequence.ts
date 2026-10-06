/**
 * Default follow-up sequence (Day 0 / Day 3 / Day 7).
 * Kept free of server-only imports so both the API and client components can
 * use it.
 */

import type { Campaign } from './types';

export const DEFAULT_SEQUENCE: Campaign['sequence'] = [
  {
    day: 0,
    label: 'Initial outreach',
    channel: 'email',
    note: 'Send the personalised pitch manually from the lead page (mail client or WhatsApp).',
  },
  {
    day: 3,
    label: 'Follow-up',
    channel: 'whatsapp',
    note: 'Short, polite nudge referencing the first message. Only send if there was no reply.',
  },
  {
    day: 7,
    label: 'Final follow-up',
    channel: 'email',
    note: 'Break-up style message. If there is still no response, move the lead to nurture or LOST.',
  },
];
