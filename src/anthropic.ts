import type { Config } from './types.js';
import { AnthropicError } from './errors.js';
import { SYSTEM_PROMPT, getUserPrompt } from './prompts.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export const ANTHROPIC_MODELS: { name: string; hint: string }[] = [
  { name: 'claude-sonnet-4-6', hint: 'balanced — recommended' },
  { name: 'claude-haiku-4-5-20251001', hint: 'fast & cheap — free tier friendly' },
  { name: 'claude-opus-4-6', hint: 'most capable' },
];

export const ANTHROPIC_CUSTOM_MODEL = '__custom__';

export async function generateCommitMessage(
  diff: string,
  config: Config,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  const body = {
    model: config.model,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: getUserPrompt(diff) }],
  };

  if (config.debug) {
    console.error('\n[DEBUG] Anthropic request body:\n', JSON.stringify(body, null, 2));
  }

  let response: Response;
  try {
    response = await fetchFn(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AnthropicError(`Could not connect to Anthropic API: ${msg}`);
  }

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const detail = errBody?.error?.message ?? `${response.status} ${response.statusText}`;
    throw new AnthropicError(`Anthropic API error: ${detail}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text: string }>;
  };

  if (config.debug) {
    console.error('\n[DEBUG] Anthropic response:\n', JSON.stringify(data, null, 2));
  }

  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new AnthropicError('Unexpected response from Anthropic API: missing content');
  }
  return text.trim();
}
