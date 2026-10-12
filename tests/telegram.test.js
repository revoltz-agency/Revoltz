import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyTelegramAuditRequest } from '../server/telegram.js';

const originalFetch = globalThis.fetch;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.TELEGRAM_CHAT_ID;

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = originalChatId;
}

test('Telegram notifications are optional when credentials are missing', async () => {
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error('must not call'); };
    assert.deepEqual(await notifyTelegramAuditRequest({ name: 'A' }), { sent: false, reason: 'not_configured' });
    assert.equal(called, false);
  } finally {
    restoreEnvironment();
  }
});

test('new audit requests are sent to the configured private Telegram chat', async () => {
  try {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '123456';
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 7 } }) };
    };
    const result = await notifyTelegramAuditRequest({
      name: 'Priya',
      business: 'North Star Cafe',
      email: 'priya@example.com',
      service: 'Website',
      message: 'We need more enquiries.',
    }, { id: 'request-123' });
    assert.deepEqual(result, { sent: true });
    assert.equal(request.url, 'https://api.telegram.org/bottest-token/sendMessage');
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.chat_id, '123456');
    assert.match(payload.text, /North Star Cafe/);
    assert.match(payload.text, /priya@example\.com/);
    assert.match(payload.text, /request-123/);
    assert.equal(payload.disable_web_page_preview, true);
  } finally {
    restoreEnvironment();
  }
});

test('Telegram failures do not throw or stop an enquiry from being accepted', async () => {
  try {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '123456';
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    assert.deepEqual(await notifyTelegramAuditRequest({ name: 'A' }), { sent: false, reason: 'telegram_error' });
  } finally {
    restoreEnvironment();
  }
});
