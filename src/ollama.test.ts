import { describe, it, expect, vi } from 'vitest';
import {
  generateCommitMessage,
  getLocalModels,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
  LOCAL_OLLAMA_URL,
  CLOUD_OLLAMA_URL,
  OLLAMA_CHAT_PATH,
  OLLAMA_TAGS_PATH,
  DEFAULT_CLOUD_MODEL,
} from './ollama.js';
import { OllamaError } from './errors.js';
import type { Config } from './types.js';

const baseConfig: Config = {
  provider: 'ollama',
  ollamaMode: 'local',
  url: 'http://localhost:11434/api/chat',
  model: 'llama3.2',
  debug: false,
};

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => body,
  } as unknown as Response;
}

describe('generateCommitMessage', () => {
  it('returns trimmed commit message from successful API response', async () => {
    const fetchFn = async () => makeResponse({ message: { content: '  feat: add login  ' } });
    const result = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(result).toBe('feat: add login');
  });

  it('sends POST to the configured URL', async () => {
    let capturedUrl = '';
    const fetchFn = async (url: string) => {
      capturedUrl = url;
      return makeResponse({ message: { content: 'feat: test' } });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(capturedUrl).toBe(baseConfig.url);
  });

  it('sends the correct model in the request body', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ message: { content: 'feat: test' } });
    };
    await generateCommitMessage(
      'diff',
      { ...baseConfig, model: 'mistral' },
      fetchFn as typeof fetch,
    );
    expect(body.model).toBe('mistral');
  });

  it('sets stream: false in the request body', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ message: { content: 'feat: test' } });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(body.stream).toBe(false);
  });

  it('includes the diff in the user message', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ message: { content: 'feat: test' } });
    };
    await generateCommitMessage('my unique diff content', baseConfig, fetchFn as typeof fetch);
    const messages = body.messages as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('my unique diff content');
  });

  it('adds Authorization header when apiKey is set', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      headers = opts.headers as Record<string, string>;
      return makeResponse({ message: { content: 'feat: test' } });
    };
    await generateCommitMessage(
      'diff',
      { ...baseConfig, apiKey: 'sk-secret' },
      fetchFn as typeof fetch,
    );
    expect(headers['Authorization']).toBe('Bearer sk-secret');
  });

  it('does not add Authorization header when apiKey is absent', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      headers = opts.headers as Record<string, string>;
      return makeResponse({ message: { content: 'feat: test' } });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(headers['Authorization']).toBeUndefined();
  });

  it('throws OllamaError with ollama serve hint when connection fails', async () => {
    const fetchFn = async () => {
      throw new Error('ECONNREFUSED');
    };
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.message).toContain('ollama serve');
  });

  it('handles non-Error thrown from fetch', async () => {
    const fetchFn = async () => {
      throw 'string error';
    };
    await expect(
      generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch),
    ).rejects.toThrow(OllamaError);
  });

  it('throws OllamaError with HTTP status in message on non-ok response', async () => {
    const fetchFn = async () => makeResponse({}, false, 503);
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.message).toContain('503');
  });

  it('throws OllamaError when response body has no message.content string', async () => {
    const fetchFn = async () => makeResponse({ message: { content: 42 } });
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.message).toContain('missing "message.content"');
  });

  it('logs request body and response to console.error in debug mode', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = async () => makeResponse({ message: { content: 'feat: debug' } });
    await generateCommitMessage('diff', { ...baseConfig, debug: true }, fetchFn as typeof fetch);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('buildOllamaChatUrl', () => {
  it('returns local URL when mode is local and no OLLAMA_HOST', () => {
    expect(buildOllamaChatUrl('local', {})).toBe(LOCAL_OLLAMA_URL);
  });

  it('returns cloud URL when mode is cloud', () => {
    expect(buildOllamaChatUrl('cloud', {})).toBe(CLOUD_OLLAMA_URL);
  });

  it('uses OLLAMA_HOST with host:port for local', () => {
    expect(buildOllamaChatUrl('local', { OLLAMA_HOST: 'localhost:8080' })).toBe(
      `http://localhost:8080${OLLAMA_CHAT_PATH}`,
    );
  });

  it('ignores OLLAMA_HOST for cloud', () => {
    expect(buildOllamaChatUrl('cloud', { OLLAMA_HOST: 'localhost:8080' })).toBe(CLOUD_OLLAMA_URL);
  });
});

describe('buildOllamaTagsUrl', () => {
  it('replaces /api/chat with /api/tags', () => {
    expect(buildOllamaTagsUrl(`http://localhost:11434${OLLAMA_CHAT_PATH}`)).toBe(
      `http://localhost:11434${OLLAMA_TAGS_PATH}`,
    );
  });

  it('works with a custom host and port', () => {
    expect(buildOllamaTagsUrl(`http://localhost:8080${OLLAMA_CHAT_PATH}`)).toBe(
      `http://localhost:8080${OLLAMA_TAGS_PATH}`,
    );
  });

  it('works with a remote host', () => {
    expect(buildOllamaTagsUrl(`http://192.168.1.5:11434${OLLAMA_CHAT_PATH}`)).toBe(
      `http://192.168.1.5:11434${OLLAMA_TAGS_PATH}`,
    );
  });

  it('works with a custom path prefix', () => {
    expect(buildOllamaTagsUrl('http://myserver.com/ollama/api/chat')).toBe(
      'http://myserver.com/ollama/api/tags',
    );
  });
});

describe('DEFAULT_CLOUD_MODEL', () => {
  it('is defined', () => {
    expect(DEFAULT_CLOUD_MODEL).toBe('devstral-small-2:24b');
  });
});

describe('getLocalModels', () => {
  const TAGS_URL = 'http://localhost:11434/api/tags';

  it('returns model names from a successful response', async () => {
    const fetchFn = async () =>
      makeResponse({
        models: [{ name: 'llama3.2:latest' }, { name: 'mistral:latest' }],
      });
    const models = await getLocalModels(TAGS_URL, fetchFn as typeof fetch);
    expect(models).toEqual(['llama3.2:latest', 'mistral:latest']);
  });

  it('returns an empty array when no models are installed', async () => {
    const fetchFn = async () => makeResponse({ models: [] });
    const models = await getLocalModels(TAGS_URL, fetchFn as typeof fetch);
    expect(models).toEqual([]);
  });

  it('sends a GET request to the tags URL', async () => {
    let capturedUrl = '';
    const fetchFn = async (url: string) => {
      capturedUrl = url;
      return makeResponse({ models: [] });
    };
    await getLocalModels(TAGS_URL, fetchFn as typeof fetch);
    expect(capturedUrl).toBe(TAGS_URL);
  });

  it('throws OllamaError with ollama serve hint when connection fails', async () => {
    const fetchFn = async () => {
      throw new Error('ECONNREFUSED');
    };
    const err = await getLocalModels(TAGS_URL, fetchFn as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.message).toContain('ollama serve');
  });

  it('throws OllamaError on non-ok response', async () => {
    const fetchFn = async () => makeResponse({}, false, 500);
    const err = await getLocalModels(TAGS_URL, fetchFn as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.message).toContain('500');
  });

  it('handles non-Error thrown from fetch', async () => {
    const fetchFn = async () => {
      throw 'string error';
    };
    await expect(getLocalModels(TAGS_URL, fetchFn as typeof fetch)).rejects.toThrow(OllamaError);
  });

  it('throws OllamaError when response body has no models array', async () => {
    const fetchFn = async () => makeResponse({ not_models: 'wrong' });
    const err = await getLocalModels(TAGS_URL, fetchFn as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.message).toContain('missing "models" list');
  });
});
