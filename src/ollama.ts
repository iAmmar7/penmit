import type { Config, OllamaMode } from './types.js';
import { OllamaError } from './errors.js';
import { SYSTEM_PROMPT, getUserPrompt } from './prompts.js';

export const OLLAMA_CHAT_PATH = '/api/chat';
export const OLLAMA_TAGS_PATH = '/api/tags';
export const LOCAL_OLLAMA_URL = `http://localhost:11434${OLLAMA_CHAT_PATH}`;
export const CLOUD_OLLAMA_URL = `https://ollama.com${OLLAMA_CHAT_PATH}`;
export const DEFAULT_CLOUD_MODEL = 'devstral-small-2:24b';

// OLLAMA_HOST is Ollama's own env var for configuring the server address.
// The Ollama client (ollama run, ollama pull, etc.) also reads it to know where to connect.
// Ref: https://github.com/ollama/ollama/blob/main/api/client.go
function buildLocalOllamaUrl(env: Record<string, string | undefined>): string {
  const host = env.OLLAMA_HOST;
  if (!host) return LOCAL_OLLAMA_URL;

  const base = host.includes('://') ? host : `http://${host}`;
  const url = new URL(base);

  // If user provided a custom path, use the URL as-is
  if (url.pathname !== '/') return base.replace(/\/$/, '');

  // Otherwise append the standard Ollama path
  return `${base.replace(/\/$/, '')}${OLLAMA_CHAT_PATH}`;
}

export function buildOllamaChatUrl(
  mode: OllamaMode,
  env: Record<string, string | undefined> = process.env,
): string {
  if (mode === 'cloud') return CLOUD_OLLAMA_URL;
  return buildLocalOllamaUrl(env);
}

export function buildOllamaTagsUrl(chatUrl: string): string {
  return chatUrl.replace(OLLAMA_CHAT_PATH, OLLAMA_TAGS_PATH);
}

export async function getLocalModels(
  tagsUrl: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchFn(tagsUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OllamaError(
      `Could not connect to Ollama: ${msg}. Make sure it is running with: ollama serve`,
    );
  }

  if (!response.ok) {
    throw new OllamaError(`Ollama returned an error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data?.models)) {
    throw new OllamaError('Unexpected response from Ollama: missing "models" list');
  }
  return (data.models as { name: string }[]).map((m) => m.name);
}

export async function generateCommitMessage(
  diff: string,
  config: Config,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: getUserPrompt(diff) },
    ],
    stream: false,
  };

  if (config.debug) {
    console.error('\n[DEBUG] Request body:\n', JSON.stringify(body, null, 2));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetchFn(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OllamaError(
      `Could not connect to Ollama: ${msg}. Make sure it is running with: ollama serve`,
    );
  }

  if (!response.ok) {
    throw new OllamaError(`Ollama returned an error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (config.debug) {
    console.error('\n[DEBUG] Raw response:\n', JSON.stringify(data, null, 2));
  }

  const content = data?.message?.content;
  if (typeof content !== 'string') {
    throw new OllamaError('Unexpected response from Ollama: missing "message.content"');
  }
  return content.trim();
}
