import { describe, it, expect, vi } from 'vitest';
import { generateCommitMessage } from './anthropic.js';
import { AnthropicError } from './errors.js';
import type { Config } from './types.js';

const baseConfig: Config = {
  provider: 'anthropic',
  url: '',
  model: 'claude-sonnet-4-6',
  apiKey: 'sk-ant-test',
  debug: false,
};

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
  } as unknown as Response;
}

describe('generateCommitMessage (Anthropic)', () => {
  it('returns trimmed commit message from successful API response', async () => {
    const fetchFn = async () =>
      makeResponse({ content: [{ type: 'text', text: '  feat: add login  ' }] });
    const result = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(result).toBe('feat: add login');
  });

  it('sends POST to the Anthropic API URL', async () => {
    let capturedUrl = '';
    const fetchFn = async (url: string) => {
      capturedUrl = url;
      return makeResponse({ content: [{ type: 'text', text: 'feat: test' }] });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
  });

  it('sends the correct model in the request body', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ content: [{ type: 'text', text: 'feat: test' }] });
    };
    await generateCommitMessage(
      'diff',
      { ...baseConfig, model: 'claude-haiku-4-5-20251001' },
      fetchFn as typeof fetch,
    );
    expect(body.model).toBe('claude-haiku-4-5-20251001');
  });

  it('sends x-api-key header', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      headers = opts.headers as Record<string, string>;
      return makeResponse({ content: [{ type: 'text', text: 'feat: test' }] });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(headers['x-api-key']).toBe('sk-ant-test');
  });

  it('sends empty x-api-key when apiKey is undefined', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      headers = opts.headers as Record<string, string>;
      return makeResponse({ content: [{ type: 'text', text: 'feat: test' }] });
    };
    await generateCommitMessage(
      'diff',
      { ...baseConfig, apiKey: undefined },
      fetchFn as typeof fetch,
    );
    expect(headers['x-api-key']).toBe('');
  });

  it('sends anthropic-version header', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      headers = opts.headers as Record<string, string>;
      return makeResponse({ content: [{ type: 'text', text: 'feat: test' }] });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('sends system prompt as top-level field', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ content: [{ type: 'text', text: 'feat: test' }] });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(typeof body.system).toBe('string');
    expect((body.system as string).length).toBeGreaterThan(0);
  });

  it('includes the diff in the user message', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ content: [{ type: 'text', text: 'feat: test' }] });
    };
    await generateCommitMessage('my unique diff content', baseConfig, fetchFn as typeof fetch);
    const messages = body.messages as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('my unique diff content');
  });

  it('throws AnthropicError when connection fails', async () => {
    const fetchFn = async () => {
      throw new Error('ECONNREFUSED');
    };
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AnthropicError);
    expect(err.message).toContain('Could not connect to Anthropic API');
  });

  it('handles non-Error thrown from fetch', async () => {
    const fetchFn = async () => {
      throw 'string error';
    };
    await expect(
      generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch),
    ).rejects.toThrow(AnthropicError);
  });

  it('throws AnthropicError with error message on non-ok response with body', async () => {
    const fetchFn = async () => makeResponse({ error: { message: 'Invalid API key' } }, false, 401);
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AnthropicError);
    expect(err.message).toContain('Invalid API key');
  });

  it('throws AnthropicError with HTTP status when error body has no message', async () => {
    const fetchFn = async () => makeResponse({}, false, 500);
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AnthropicError);
    expect(err.message).toContain('500');
  });

  it('throws AnthropicError when content is missing in response', async () => {
    const fetchFn = async () => makeResponse({ content: [] });
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AnthropicError);
    expect(err.message).toContain('missing content');
  });

  it('logs request body and response to console.error in debug mode', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = async () => makeResponse({ content: [{ type: 'text', text: 'feat: debug' }] });
    await generateCommitMessage('diff', { ...baseConfig, debug: true }, fetchFn as typeof fetch);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
