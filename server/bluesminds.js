const DEFAULT_BASE_URL = 'https://api.bluesminds.com/v1/responses';

export async function generateWithBluesMinds({ prompt, model = process.env.BLUESMINDS_MODEL || '' }) {
  const apiKey = process.env.BLUESMINDS_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error('BluesMinds is not configured on this server. Set BLUESMINDS_API_KEY in the server environment.');
    error.statusCode = 503;
    throw error;
  }
  if (!model) {
    const error = new Error('Set BLUESMINDS_MODEL to a model ID enabled for your account.');
    error.statusCode = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(process.env.BLUESMINDS_RESPONSES_URL?.trim() || DEFAULT_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({ model, input: prompt }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof data?.error?.message === 'string'
        ? data.error.message.slice(0, 400)
        : `BluesMinds request failed (HTTP ${response.status}).`);
      error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
      throw error;
    }
    const output = Array.isArray(data?.output)
      ? data.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
        .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
        .map((item) => item.text).join('\n').trim()
      : '';
    if (!output) {
      const error = new Error('BluesMinds returned no text output. Check that the selected model supports the Responses API.');
      error.statusCode = 502;
      throw error;
    }
    return { text: output, model: typeof data.model === 'string' ? data.model : model, usage: data.usage || null };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('BluesMinds request timed out. Please try again.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
