import { generateGeminiJson } from './geminiLeadFinder.js';

/**
 * Shared JSON-generation entry point. All AI features use the Gemini API key
 * entered by the user in AgencyOS Settings; no alternate provider or backend
 * provider credentials are required.
 */
export async function generateAgencyJson({ prompt, geminiApiKey = '' }) {
  if (!String(geminiApiKey || '').trim()) {
    throw new Error('Add your Gemini API key in Settings first.');
  }
  return generateGeminiJson({ apiKey: geminiApiKey, prompt });
}
