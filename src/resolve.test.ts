import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as tuiModule from './tui.js';
import * as ollamaModule from './ollama.js';
import { ANTHROPIC_CUSTOM_MODEL } from './anthropic.js';
import { LLMError } from './errors.js';
import { resolveProvider, resolveApiKey, resolveAnthropicModel, resolveOllamaModel } from './resolve.js';
import type { ParsedArgs, UserConfig } from './types.js';

vi.mock('./tui.js');
vi.mock('./ollama.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ollama.js')>();
  return { ...actual, getLocalModels: vi.fn() };
});

const noArgs: ParsedArgs = { help: false, version: false, setup: false };
const emptyConfig: UserConfig = {};

describe('resolveProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns CLI flag provider immediately without interactive', async () => {
    const args: ParsedArgs = { ...noArgs, provider: 'anthropic' };
    const result = await resolveProvider(args, emptyConfig, {});
    expect(result).toEqual({ provider: 'anthropic', ollamaMode: undefined, fromInteractive: false });
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('returns CLI flag ollama+cloud with mode', async () => {
    const args: ParsedArgs = { ...noArgs, provider: 'ollama', ollamaMode: 'cloud' };
    const result = await resolveProvider(args, emptyConfig, {});
    expect(result).toEqual({ provider: 'ollama', ollamaMode: 'cloud', fromInteractive: false });
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('returns anthropic when ANTHROPIC_API_KEY is set (no CLI flag)', async () => {
    const result = await resolveProvider(noArgs, emptyConfig, { ANTHROPIC_API_KEY: 'sk-ant' });
    expect(result).toEqual({ provider: 'anthropic', fromInteractive: false });
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('returns ollama+cloud when OLLAMA_API_KEY is set (no CLI flag)', async () => {
    const result = await resolveProvider(noArgs, emptyConfig, { OLLAMA_API_KEY: 'sk-ollama' });
    expect(result).toEqual({ provider: 'ollama', ollamaMode: 'cloud', fromInteractive: false });
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('returns saved config when provider is set and not --setup', async () => {
    const saved: UserConfig = { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' };
    const result = await resolveProvider(noArgs, saved, {});
    expect(result).toEqual({ provider: 'ollama', ollamaMode: 'local', fromInteractive: false });
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('ignores saved config and shows picker when --setup is set', async () => {
    const args: ParsedArgs = { ...noArgs, setup: true };
    const saved: UserConfig = { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' };
    vi.mocked(tuiModule.selectFromList).mockResolvedValue('ollama-local');
    const result = await resolveProvider(args, saved, {});
    expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
    expect(result.fromInteractive).toBe(true);
  });

  it('shows interactive picker when no saved config and no env vars', async () => {
    vi.mocked(tuiModule.selectFromList).mockResolvedValue('ollama-local');
    const result = await resolveProvider(noArgs, emptyConfig, {});
    expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ provider: 'ollama', ollamaMode: 'local', fromInteractive: true });
  });

  it('returns anthropic from interactive picker', async () => {
    vi.mocked(tuiModule.selectFromList).mockResolvedValue('anthropic');
    const result = await resolveProvider(noArgs, emptyConfig, {});
    expect(result).toEqual({ provider: 'anthropic', fromInteractive: true });
  });

  it('returns ollama+cloud from interactive picker', async () => {
    vi.mocked(tuiModule.selectFromList).mockResolvedValue('ollama-cloud');
    const result = await resolveProvider(noArgs, emptyConfig, {});
    expect(result).toEqual({ provider: 'ollama', ollamaMode: 'cloud', fromInteractive: true });
  });
});

describe('resolveApiKey', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const opts = { label: 'TestProvider', envVarName: 'TEST_API_KEY' };

  it('returns env key when present', async () => {
    const result = await resolveApiKey('sk-env', undefined, opts);
    expect(result).toBe('sk-env');
  });

  it('trims whitespace from env key', async () => {
    const result = await resolveApiKey('  sk-env  ', undefined, opts);
    expect(result).toBe('sk-env');
  });

  it('returns saved key when env key is absent', async () => {
    const result = await resolveApiKey(undefined, 'sk-saved', opts);
    expect(result).toBe('sk-saved');
  });

  it('prefers env key over saved key', async () => {
    const result = await resolveApiKey('sk-env', 'sk-saved', opts);
    expect(result).toBe('sk-env');
  });

  it('calls process.exit(1) in non-TTY context when no key is available', async () => {
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    try {
      await expect(resolveApiKey(undefined, undefined, opts)).rejects.toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TEST_API_KEY'));
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
    }
  });

  it('prompts for input in TTY context and returns entered value', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.mocked(tuiModule.promptInput).mockResolvedValue('sk-entered');
    try {
      const result = await resolveApiKey(undefined, undefined, opts);
      expect(tuiModule.promptInput).toHaveBeenCalledWith('TestProvider API key: ');
      expect(result).toBe('sk-entered');
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
    }
  });

  it('calls process.exit(1) when TTY input is empty', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.mocked(tuiModule.promptInput).mockResolvedValue('');
    try {
      await expect(resolveApiKey(undefined, undefined, opts)).rejects.toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('API key is required'));
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
    }
  });
});

describe('resolveAnthropicModel', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('returns args.model immediately without picker', async () => {
    const args: ParsedArgs = { ...noArgs, model: 'claude-sonnet-4-6' };
    const result = await resolveAnthropicModel(args, emptyConfig);
    expect(result).toEqual({ model: 'claude-sonnet-4-6', fromInteractive: false });
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('returns saved model when provider is anthropic and not --setup', async () => {
    const saved: UserConfig = { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' };
    const result = await resolveAnthropicModel(noArgs, saved);
    expect(result).toEqual({ model: 'claude-haiku-4-5-20251001', fromInteractive: false });
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('does not use saved model when --setup is set', async () => {
    const args: ParsedArgs = { ...noArgs, setup: true };
    const saved: UserConfig = { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' };
    vi.mocked(tuiModule.selectFromList).mockResolvedValue('claude-sonnet-4-6');
    const result = await resolveAnthropicModel(args, saved);
    expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ model: 'claude-sonnet-4-6', fromInteractive: true });
  });

  it('does not use saved model when saved provider is not anthropic', async () => {
    const saved: UserConfig = { provider: 'ollama', model: 'llama3.2' };
    vi.mocked(tuiModule.selectFromList).mockResolvedValue('claude-sonnet-4-6');
    await resolveAnthropicModel(noArgs, saved);
    expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
  });

  it('shows interactive picker when no saved model and returns selected', async () => {
    vi.mocked(tuiModule.selectFromList).mockResolvedValue('claude-sonnet-4-6');
    const result = await resolveAnthropicModel(noArgs, emptyConfig);
    expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ model: 'claude-sonnet-4-6', fromInteractive: true });
  });

  it('prompts for custom model name when ANTHROPIC_CUSTOM_MODEL is selected', async () => {
    vi.mocked(tuiModule.selectFromList).mockResolvedValue(ANTHROPIC_CUSTOM_MODEL);
    vi.mocked(tuiModule.promptInput).mockResolvedValue('my-custom-model');
    const result = await resolveAnthropicModel(noArgs, emptyConfig);
    expect(tuiModule.promptInput).toHaveBeenCalledWith('Model name: ');
    expect(result).toEqual({ model: 'my-custom-model', fromInteractive: true });
  });

  it('calls process.exit(1) when custom model input is empty', async () => {
    vi.mocked(tuiModule.selectFromList).mockResolvedValue(ANTHROPIC_CUSTOM_MODEL);
    vi.mocked(tuiModule.promptInput).mockResolvedValue('');
    await expect(resolveAnthropicModel(noArgs, emptyConfig)).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Model name is required.');
  });
});

describe('resolveOllamaModel', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const localOpts = { mode: 'local' as const, tagsUrl: 'http://localhost:11434/api/tags' };
  const cloudOpts = { mode: 'cloud' as const, tagsUrl: '' };

  it('returns args.model immediately in local mode without picker', async () => {
    const args: ParsedArgs = { ...noArgs, model: 'codellama' };
    const result = await resolveOllamaModel(args, emptyConfig, localOpts);
    expect(result).toEqual({ model: 'codellama', fromInteractive: false });
    expect(ollamaModule.getLocalModels).not.toHaveBeenCalled();
    expect(tuiModule.selectFromList).not.toHaveBeenCalled();
  });

  it('returns args.model immediately in cloud mode without prompting', async () => {
    const args: ParsedArgs = { ...noArgs, model: 'devstral-2' };
    const result = await resolveOllamaModel(args, emptyConfig, cloudOpts);
    expect(result).toEqual({ model: 'devstral-2', fromInteractive: false });
    expect(tuiModule.promptInput).not.toHaveBeenCalled();
  });

  describe('cloud mode', () => {
    it('returns saved cloud model when available and not --setup', async () => {
      const saved: UserConfig = { provider: 'ollama', ollamaMode: 'cloud', model: 'devstral-2' };
      const result = await resolveOllamaModel(noArgs, saved, cloudOpts);
      expect(result).toEqual({ model: 'devstral-2', fromInteractive: false });
      expect(tuiModule.promptInput).not.toHaveBeenCalled();
    });

    it('ignores saved model when --setup is set and prompts instead', async () => {
      const args: ParsedArgs = { ...noArgs, setup: true };
      const saved: UserConfig = { provider: 'ollama', ollamaMode: 'cloud', model: 'devstral-2' };
      vi.mocked(tuiModule.promptInput).mockResolvedValue('devstral-small-2:24b');
      const result = await resolveOllamaModel(args, saved, cloudOpts);
      expect(tuiModule.promptInput).toHaveBeenCalled();
      expect(result.fromInteractive).toBe(true);
    });

    it('ignores saved local model when switching to cloud mode', async () => {
      const saved: UserConfig = { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' };
      vi.mocked(tuiModule.promptInput).mockResolvedValue('devstral-2');
      const result = await resolveOllamaModel(noArgs, saved, cloudOpts);
      expect(tuiModule.promptInput).toHaveBeenCalled();
      expect(result.model).toBe('devstral-2');
    });

    it('uses DEFAULT_CLOUD_MODEL when cloud model prompt is empty', async () => {
      vi.mocked(tuiModule.promptInput).mockResolvedValue('');
      const result = await resolveOllamaModel(noArgs, emptyConfig, cloudOpts);
      expect(result).toEqual({ model: ollamaModule.DEFAULT_CLOUD_MODEL, fromInteractive: true });
    });

    it('uses entered value when cloud model prompt is non-empty', async () => {
      vi.mocked(tuiModule.promptInput).mockResolvedValue('devstral-small-2:24b');
      const result = await resolveOllamaModel(noArgs, emptyConfig, cloudOpts);
      expect(result).toEqual({ model: 'devstral-small-2:24b', fromInteractive: true });
    });
  });

  describe('local mode', () => {
    it('throws LLMError when no local models are installed', async () => {
      vi.mocked(ollamaModule.getLocalModels).mockResolvedValue([]);
      await expect(resolveOllamaModel(noArgs, emptyConfig, localOpts)).rejects.toThrow(LLMError);
      await expect(resolveOllamaModel(noArgs, emptyConfig, localOpts)).rejects.toThrow(
        'No local models found',
      );
    });

    it('propagates errors thrown by getLocalModels', async () => {
      const err = new Error('network failure');
      vi.mocked(ollamaModule.getLocalModels).mockRejectedValue(err);
      await expect(resolveOllamaModel(noArgs, emptyConfig, localOpts)).rejects.toThrow(
        'network failure',
      );
    });

    it('returns saved model silently when it is still installed', async () => {
      const saved: UserConfig = { provider: 'ollama', ollamaMode: 'local', model: 'mistral' };
      vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);
      const result = await resolveOllamaModel(noArgs, saved, localOpts);
      expect(result).toEqual({ model: 'mistral', fromInteractive: false });
      expect(tuiModule.selectFromList).not.toHaveBeenCalled();
    });

    it('shows model picker when saved model is no longer installed', async () => {
      const saved: UserConfig = { provider: 'ollama', ollamaMode: 'local', model: 'removed-model' };
      vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);
      vi.mocked(tuiModule.selectFromList).mockResolvedValue('mistral');
      const result = await resolveOllamaModel(noArgs, saved, localOpts);
      expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ model: 'mistral', fromInteractive: true });
    });

    it('shows model picker on first run (no saved model)', async () => {
      vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);
      vi.mocked(tuiModule.selectFromList).mockResolvedValue('llama3.2');
      const result = await resolveOllamaModel(noArgs, emptyConfig, localOpts);
      expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ model: 'llama3.2', fromInteractive: true });
    });

    it('auto-picks first model when provider CLI flag is set without --setup', async () => {
      const args: ParsedArgs = { ...noArgs, provider: 'ollama', ollamaMode: 'local' };
      vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);
      const result = await resolveOllamaModel(args, emptyConfig, localOpts);
      expect(tuiModule.selectFromList).not.toHaveBeenCalled();
      expect(result).toEqual({ model: 'llama3.2', fromInteractive: false });
    });

    it('shows picker even with provider CLI flag when --setup is set', async () => {
      const args: ParsedArgs = { ...noArgs, provider: 'ollama', ollamaMode: 'local', setup: true };
      vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);
      vi.mocked(tuiModule.selectFromList).mockResolvedValue('mistral');
      const result = await resolveOllamaModel(args, emptyConfig, localOpts);
      expect(tuiModule.selectFromList).toHaveBeenCalledTimes(1);
      expect(result.fromInteractive).toBe(true);
    });
  });
});
