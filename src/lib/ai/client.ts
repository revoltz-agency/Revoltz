/**
 * Optional AI provider layer.
 *
 * Supports any OpenAI-compatible Chat Completions endpoint plus Google Gemini.
 * If nothing is configured (or `AI_ENABLED=false`), callers fall back to
 * deterministic templates and the UI says so explicitly — the app never
 * pretends an AI provider was used.
 */

import { getConfig } from '../config';

export interface AiJsonResult<T> {
  ok: boolean;
  data: T | null;
  provider: 'openai' | 'gemini' | null;
  model: string | null;
  error: string | null;
  /** 'ai' when the model produced usable JSON, 'template' otherwise. */
  generatedBy: 'ai' | 'template';
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fenced?.[1] ?? trimmed;
  // Some models add prose around the JSON — grab the outermost object.
  const firstBrace = body.indexOf('{');
  const lastBrace = body.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return body.slice(firstBrace, lastBrace + 1);
  return body;
}

async function callOpenAiCompatible<T>(system: string, user: string): Promise<AiJsonResult<T>> {
  const cfg = getConfig();
  const url = `${cfg.ai.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.ai.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.ai.model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      data: null,
      provider: 'openai',
      model: cfg.ai.model,
      error: `AI provider returned HTTP ${res.status}: ${text.slice(0, 300)}`,
      generatedBy: 'template',
    };
  }
  try {
    const parsed = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    const content = parsed.choices?.[0]?.message?.content ?? '';
    const data = JSON.parse(stripFences(content)) as T;
    return { ok: true, data, provider: 'openai', model: cfg.ai.model, error: null, generatedBy: 'ai' };
  } catch (err) {
    return {
      ok: false,
      data: null,
      provider: 'openai',
      model: cfg.ai.model,
      error: `Could not parse AI response as JSON (${err instanceof Error ? err.message : 'unknown'})`,
      generatedBy: 'template',
    };
  }
}

async function callGemini<T>(system: string, user: string): Promise<AiJsonResult<T>> {
  const cfg = getConfig();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.ai.model,
  )}:generateContent?key=${encodeURIComponent(cfg.ai.apiKey ?? '')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { role: 'system', parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(45_000),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      data: null,
      provider: 'gemini',
      model: cfg.ai.model,
      error: `Gemini returned HTTP ${res.status}: ${text.slice(0, 300)}`,
      generatedBy: 'template',
    };
  }
  try {
    const parsed = JSON.parse(text) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const content = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const data = JSON.parse(stripFences(content)) as T;
    return { ok: true, data, provider: 'gemini', model: cfg.ai.model, error: null, generatedBy: 'ai' };
  } catch (err) {
    return {
      ok: false,
      data: null,
      provider: 'gemini',
      model: cfg.ai.model,
      error: `Could not parse Gemini response as JSON (${err instanceof Error ? err.message : 'unknown'})`,
      generatedBy: 'template',
    };
  }
}

/** Ask the configured model for a JSON object; never throws. */
export async function generateJson<T>(opts: { system: string; user: string }): Promise<AiJsonResult<T>> {
  const cfg = getConfig();
  if (!cfg.ai.enabled || !cfg.ai.provider) {
    return {
      ok: false,
      data: null,
      provider: null,
      model: null,
      error: cfg.ai.provider
        ? 'AI calls are disabled via AI_ENABLED=false.'
        : 'No AI provider configured (set OPENAI_API_KEY or GEMINI_API_KEY).',
      generatedBy: 'template',
    };
  }
  try {
    return cfg.ai.provider === 'gemini'
      ? await callGemini<T>(opts.system, opts.user)
      : await callOpenAiCompatible<T>(opts.system, opts.user);
  } catch (err) {
    return {
      ok: false,
      data: null,
      provider: cfg.ai.provider,
      model: cfg.ai.model,
      error: err instanceof Error ? err.message : 'AI request failed',
      generatedBy: 'template',
    };
  }
}
