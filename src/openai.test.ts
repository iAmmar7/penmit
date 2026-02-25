import { describe, it, expect, vi } from 'vitest';
import { generateCommitMessage } from './openai.js';
import { OpenAIError } from './errors.js';
import type { Config } from './types.js';

const baseConfig: Config = {
  provider: 'openai',
  url: '',
  model: 'codex-mini-latest',
  apiKey: 'sk-test',
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

describe('generateCommitMessage (OpenAI)', () => {
  it('returns trimmed commit message from output_text field', async () => {
    const fetchFn = async () => makeResponse({ output_text: '  feat: add login  ' });
    const result = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(result).toBe('feat: add login');
  });

  it('falls back to output[0].content[0].text when output_text is absent', async () => {
    const fetchFn = async () =>
      makeResponse({
        output: [{ content: [{ type: 'output_text', text: '  fix: null check  ' }] }],
      });
    const result = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(result).toBe('fix: null check');
  });

  it('sends POST to the Responses API URL', async () => {
    let capturedUrl = '';
    const fetchFn = async (url: string) => {
      capturedUrl = url;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(capturedUrl).toBe('https://api.openai.com/v1/responses');
  });

  it('sends the correct model in the request body', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage(
      'diff',
      { ...baseConfig, model: 'gpt-4o' },
      fetchFn as typeof fetch,
    );
    expect(body.model).toBe('gpt-4o');
  });

  it('sends Authorization Bearer header', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      headers = opts.headers as Record<string, string>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(headers['Authorization']).toBe('Bearer sk-test');
  });

  it('sends empty Bearer token when apiKey is undefined', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      headers = opts.headers as Record<string, string>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage(
      'diff',
      { ...baseConfig, apiKey: undefined },
      fetchFn as typeof fetch,
    );
    expect(headers['Authorization']).toBe('Bearer ');
  });

  it('sends instructions as a top-level string field (not messages)', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(typeof body.instructions).toBe('string');
    expect((body.instructions as string).length).toBeGreaterThan(0);
    expect(body.messages).toBeUndefined();
  });

  it('sends input as a top-level string field (not messages)', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(typeof body.input).toBe('string');
    expect(body.messages).toBeUndefined();
  });

  it('includes the diff in the input field', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage('my unique diff content', baseConfig, fetchFn as typeof fetch);
    expect(body.input as string).toContain('my unique diff content');
  });

  it('sends max_output_tokens (not max_tokens)', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(typeof body.max_output_tokens).toBe('number');
    expect(body.max_tokens).toBeUndefined();
  });

  it('sends store: false to avoid persisting single-turn requests', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = async (_: string, opts: RequestInit) => {
      body = JSON.parse(opts.body as string) as Record<string, unknown>;
      return makeResponse({ output_text: 'feat: test' });
    };
    await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch);
    expect(body.store).toBe(false);
  });

  it('throws OpenAIError when connection fails', async () => {
    const fetchFn = async () => {
      throw new Error('ECONNREFUSED');
    };
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OpenAIError);
    expect(err.message).toContain('Could not connect to OpenAI API');
  });

  it('handles non-Error thrown from fetch', async () => {
    const fetchFn = async () => {
      throw 'string error';
    };
    await expect(
      generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch),
    ).rejects.toThrow(OpenAIError);
  });

  it('throws OpenAIError with error message on non-ok response with body', async () => {
    const fetchFn = async () => makeResponse({ error: { message: 'Invalid API key' } }, false, 401);
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OpenAIError);
    expect(err.message).toContain('Invalid API key');
  });

  it('throws OpenAIError with HTTP status when error body has no message', async () => {
    const fetchFn = async () => makeResponse({}, false, 500);
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OpenAIError);
    expect(err.message).toContain('500');
  });

  it('throws OpenAIError when both output_text and output are missing', async () => {
    const fetchFn = async () => makeResponse({});
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OpenAIError);
    expect(err.message).toContain('missing content');
  });

  it('throws OpenAIError when output array is empty', async () => {
    const fetchFn = async () => makeResponse({ output: [] });
    const err = await generateCommitMessage('diff', baseConfig, fetchFn as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(OpenAIError);
    expect(err.message).toContain('missing content');
  });

  it('logs request body and response to console.error in debug mode', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = async () => makeResponse({ output_text: 'feat: debug' });
    await generateCommitMessage('diff', { ...baseConfig, debug: true }, fetchFn as typeof fetch);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
