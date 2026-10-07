export function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(dateString, days) {
  const date = dateString ? new Date(`${dateString}T12:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function formatDate(dateString, options = { day: 'numeric', month: 'short' }) {
  if (!dateString) return 'Not set';
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en', options).format(date);
}

export function followUpPlan(lead, crm) {
  if (['DO NOT CONTACT', 'WON', 'LOST'].includes(crm.status) || crm.contactPreference === 'do-not-contact') return [];
  const start = crm.followUpAnchorDate || crm.lastContacted || localDateString();
  const step = Math.max(0, Math.min(4, Number.parseInt(crm.followUpStep, 10) || (crm.lastContacted ? 1 : 0)));
  return [
    { day: 'Day 0', title: 'Initial outreach', date: start, completed: step >= 1 },
    { day: 'Day 3', title: 'Follow up', date: addDays(start, 3), completed: step >= 2 },
    { day: 'Day 7', title: 'Follow up', date: addDays(start, 7), completed: step >= 3 },
    { day: 'Day 14', title: 'Final follow up', date: addDays(start, 14), completed: step >= 4 },
  ];
}
