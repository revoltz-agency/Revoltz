import { generateGeminiJson } from './geminiLeadFinder.js';

function parseJsonText(text) {
  const cleaned = String(text || '').replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '').trim();
  try { return JSON.parse(cleaned); }
  catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('The AI returned an unreadable response. Please try again.');
    try { return JSON.parse(cleaned.slice(first, last + 1)); }
    catch { throw new Error('The AI returned an unreadable response. Please try again.'); }
  }
}

/**
 * Shared JSON-generation entry point. Prefer the secure server-side provider
 * when configured; retain the existing user-supplied Gemini path as fallback.
 */
export async function generateAgencyJson({ prompt, geminiApiKey = '' }) {
  let serverError;
  try {
    const configResponse = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (configResponse.ok) {
      const config = await configResponse.json();
      if (config.bluesmindsConfigured) {
        const response = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `AI request failed (HTTP ${response.status}).`);
        return parseJsonText(data.text);
      }
    }
  } catch (error) {
    serverError = error;
  }

  if (String(geminiApiKey || '').trim()) {
    return generateGeminiJson({ apiKey: geminiApiKey, prompt });
  }
  if (serverError) throw serverError;
  throw new Error('AI is not configured yet. Configure BluesMinds on the backend host or add a Gemini API key in Settings.');
}
