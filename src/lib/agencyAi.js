import { generateGeminiJson } from './geminiLeadFinder.js';

/** All AgencyOS AI features use the Gemini key entered in Settings. */
export async function generateAgencyJson({ prompt, geminiApiKey = '' }) {
  if (!String(geminiApiKey || '').trim()) {
    throw new Error('Add your Gemini API key in Settings first.');
  }
  return generateGeminiJson({ apiKey: geminiApiKey, prompt });
}
