import type { Config } from './types.js';
import { OpenAIError } from './errors.js';
import { SYSTEM_PROMPT, getUserPrompt } from './prompts.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

export const OPENAI_MODELS: { name: string; hint: string }[] = [
  { name: 'codex-mini-latest', hint: 'fast Codex model — recommended' },
  { name: 'gpt-4o', hint: 'balanced — most capable' },
  { name: 'gpt-4o-mini', hint: 'fast & cheap' },
];

export const OPENAI_CUSTOM_MODEL = '__custom__';

export async function generateCommitMessage(
  diff: string,
  config: Config,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  const body = {
    model: config.model,
    instructions: SYSTEM_PROMPT,
    input: getUserPrompt(diff),
    max_output_tokens: 256,
    store: false,
  };

  if (config.debug) {
    console.error('\n[DEBUG] OpenAI request body:\n', JSON.stringify(body, null, 2));
  }

  let response: Response;
  try {
    response = await fetchFn(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OpenAIError(`Could not connect to OpenAI API: ${msg}`);
  }

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const detail = errBody?.error?.message ?? `${response.status} ${response.statusText}`;
    throw new OpenAIError(`OpenAI API error: ${detail}`);
  }

  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type: string; text: string }> }>;
  };

  if (config.debug) {
    console.error('\n[DEBUG] OpenAI response:\n', JSON.stringify(data, null, 2));
  }

  const text = data?.output_text ?? data?.output?.[0]?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new OpenAIError('Unexpected response from OpenAI API: missing content');
  }
  return text.trim();
}
