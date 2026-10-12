const TELEGRAM_API = 'https://api.telegram.org';

/**
 * Sends a private notification for a new website audit request.
 * Telegram is optional: missing settings or a Telegram outage must never
 * prevent the enquiry from being saved.
 */
export async function notifyTelegramAuditRequest(values, stored = {}) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) return { sent: false, reason: 'not_configured' };

  const safe = (value, max = 3000) => String(value ?? '').trim().slice(0, max) || 'Not provided';
  const id = stored.id ? String(stored.id) : 'Unavailable';
  const text = [
    '🔔 NEW REVOLTZ FREE AI AUDIT REQUEST',
    '',
    'Name: ' + safe(values?.name, 120),
    'Business: ' + safe(values?.business, 160),
    'Email: ' + safe(values?.email, 254),
    'Interested in: ' + safe(values?.service, 120),
    '',
    'What they need:',
    safe(values?.message, 2400),
    '',
    'Request ID: ' + id,
    'Open AgencyOS → Audit Inbox to manage this enquiry.',
  ].join('\n').slice(0, 3900);

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      // Do not log the request URL: it contains the bot token.
      console.warn('[telegram] Could not send new-enquiry notification (HTTP ' + response.status + ').');
      return { sent: false, reason: 'telegram_error' };
    }
    const result = await response.json().catch(() => ({}));
    if (result?.ok !== true) {
      console.warn('[telegram] Telegram rejected a new-enquiry notification.');
      return { sent: false, reason: 'telegram_error' };
    }
    return { sent: true };
  } catch {
    console.warn('[telegram] New-enquiry notification failed; the enquiry remains saved.');
    return { sent: false, reason: 'network_error' };
  }
}
