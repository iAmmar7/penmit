import { describe, it, expect } from 'vitest';
import { computeEffectiveSettings, getProviderLabel, maskApiKey } from './show-config.js';
import { DEFAULT_CLOUD_MODEL, CLOUD_OLLAMA_URL, LOCAL_OLLAMA_URL } from './ollama.js';
import { ANTHROPIC_API_URL } from './anthropic.js';
import { OPENAI_API_URL } from './openai.js';
import { DEFAULT_MAX_COMMIT_LENGTH, DEFAULT_MAX_DIFF_BYTES } from './config.js';
import type { ParsedArgs, UserConfig } from './types.js';

const noArgs: ParsedArgs = {
  help: false,
  version: false,
  setup: false,
  reset: false,
  yes: false,
  noRedact: false,
  json: false,
};
const emptyConfig: UserConfig = {};

describe('maskApiKey', () => {
  it('shows prefix and last 4 characters', () => {
    expect(maskApiKey('sk-test-1234abcd')).toBe('sk-…abcd');
  });

  it('fully masks short keys', () => {
    expect(maskApiKey('short')).toBe('****');
  });
});

describe('getProviderLabel', () => {
  it('labels all providers', () => {
    expect(getProviderLabel('anthropic')).toBe('Anthropic');
    expect(getProviderLabel('openai')).toBe('OpenAI');
    expect(getProviderLabel('ollama', 'cloud')).toBe('Ollama Cloud');
    expect(getProviderLabel('ollama', 'local')).toBe('Local (Ollama)');
  });
});

describe('computeEffectiveSettings', () => {
  it('returns unset everywhere on a fresh machine', () => {
    const s = computeEffectiveSettings(noArgs, emptyConfig, {});
    expect(s.provider.source).toBe('unset');
    expect(s.model.source).toBe('unset');
    expect(s.apiKey.source).toBe('unset');
    expect(s.endpoint.source).toBe('unset');
    expect(s.maxLength).toEqual({ value: String(DEFAULT_MAX_COMMIT_LENGTH), source: 'default' });
    expect(s.maxDiffBytes).toEqual({ value: String(DEFAULT_MAX_DIFF_BYTES), source: 'default' });
  });

  it('flag beats env beats saved for provider', () => {
    const saved: UserConfig = { provider: 'openai', model: 'gpt-4o' };
    const env = { ANTHROPIC_API_KEY: 'sk-ant-1234abcd' };

    const fromFlag = computeEffectiveSettings(
      { ...noArgs, provider: 'ollama', ollamaMode: 'local' },
      saved,
      env,
    );
    expect(fromFlag.provider).toEqual({ value: 'Local (Ollama)', source: 'flag' });

    const fromEnv = computeEffectiveSettings(noArgs, saved, env);
    expect(fromEnv.provider).toEqual({
      value: 'Anthropic',
      source: 'env',
      detail: 'ANTHROPIC_API_KEY',
    });

    const fromSaved = computeEffectiveSettings(noArgs, saved, {});
    expect(fromSaved.provider).toEqual({ value: 'OpenAI', source: 'saved' });
  });

  it('model: flag beats saved, saved requires provider match', () => {
    const saved: UserConfig = { provider: 'anthropic', model: 'claude-sonnet-4-6' };

    const fromFlag = computeEffectiveSettings({ ...noArgs, model: 'x' }, saved, {
      ANTHROPIC_API_KEY: 'sk-ant-1234abcd',
    });
    expect(fromFlag.model).toEqual({ value: 'x', source: 'flag' });

    const matched = computeEffectiveSettings(noArgs, saved, {
      ANTHROPIC_API_KEY: 'sk-ant-1234abcd',
    });
    expect(matched.model).toEqual({ value: 'claude-sonnet-4-6', source: 'saved' });

    // env selects openai but saved model belongs to anthropic -> must not leak across providers
    const mismatched = computeEffectiveSettings(noArgs, saved, {
      OPENAI_API_KEY: 'sk-oai-1234abcd',
    });
    expect(mismatched.model.source).toBe('unset');
  });

  it('ollama saved model requires matching mode', () => {
    const saved: UserConfig = { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' };

    const local = computeEffectiveSettings(noArgs, saved, {});
    expect(local.model).toEqual({ value: 'llama3.2', source: 'saved' });

    // cloud selected via env, saved model is local-only -> falls to cloud default
    const cloud = computeEffectiveSettings(noArgs, saved, { OLLAMA_API_KEY: 'sk-oll-1234abcd' });
    expect(cloud.model).toEqual({ value: DEFAULT_CLOUD_MODEL, source: 'default' });
  });

  it('apiKey: env beats saved, masked, with env var detail', () => {
    const saved: UserConfig = {
      provider: 'ollama',
      ollamaMode: 'cloud',
      model: 'gpt-oss:20b',
      apiKey: 'sk-saved-1234abcd',
    };

    const fromEnv = computeEffectiveSettings(noArgs, saved, { OLLAMA_API_KEY: 'sk-env-9876wxyz' });
    expect(fromEnv.apiKey).toEqual({ value: 'sk-…wxyz', source: 'env', detail: 'OLLAMA_API_KEY' });

    const fromSaved = computeEffectiveSettings(noArgs, saved, {});
    expect(fromSaved.apiKey).toEqual({ value: 'sk-…abcd', source: 'saved' });
  });

  it('apiKey: saved key does not leak across providers', () => {
    const saved: UserConfig = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-1234abcd',
    };
    const s = computeEffectiveSettings({ ...noArgs, provider: 'openai' }, saved, {});
    expect(s.apiKey.source).toBe('unset');
  });

  it('apiKey: not required for local ollama', () => {
    const saved: UserConfig = { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' };
    const s = computeEffectiveSettings(noArgs, saved, {});
    expect(s.apiKey).toEqual({ source: 'unset', detail: 'not required' });
  });

  it('endpoint per provider', () => {
    const anthropic = computeEffectiveSettings(noArgs, emptyConfig, {
      ANTHROPIC_API_KEY: 'sk-ant-1234abcd',
    });
    expect(anthropic.endpoint).toEqual({ value: ANTHROPIC_API_URL, source: 'default' });

    const openai = computeEffectiveSettings(noArgs, emptyConfig, {
      OPENAI_API_KEY: 'sk-oai-1234abcd',
    });
    expect(openai.endpoint).toEqual({ value: OPENAI_API_URL, source: 'default' });

    const cloud = computeEffectiveSettings(noArgs, emptyConfig, {
      OLLAMA_API_KEY: 'sk-oll-1234abcd',
    });
    expect(cloud.endpoint).toEqual({ value: CLOUD_OLLAMA_URL, source: 'default' });

    const local = computeEffectiveSettings(
      { ...noArgs, provider: 'ollama', ollamaMode: 'local' },
      emptyConfig,
      {},
    );
    expect(local.endpoint).toEqual({ value: LOCAL_OLLAMA_URL, source: 'default' });

    const customHost = computeEffectiveSettings(
      { ...noArgs, provider: 'ollama', ollamaMode: 'local' },
      emptyConfig,
      { OLLAMA_HOST: 'myhost:8080' },
    );
    expect(customHost.endpoint).toEqual({
      value: 'http://myhost:8080/api/chat',
      source: 'env',
      detail: 'OLLAMA_HOST',
    });
  });

  it('limits: flag beats saved beats default', () => {
    const saved: UserConfig = { maxLength: 60, maxDiffBytes: 1000 };

    const fromFlag = computeEffectiveSettings(
      { ...noArgs, maxLength: 50, maxDiffBytes: 500 },
      saved,
      {},
    );
    expect(fromFlag.maxLength).toEqual({ value: '50', source: 'flag' });
    expect(fromFlag.maxDiffBytes).toEqual({ value: '500', source: 'flag' });

    const fromSaved = computeEffectiveSettings(noArgs, saved, {});
    expect(fromSaved.maxLength).toEqual({ value: '60', source: 'saved' });
    expect(fromSaved.maxDiffBytes).toEqual({ value: '1000', source: 'saved' });
  });
});
