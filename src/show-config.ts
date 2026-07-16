import { ANTHROPIC_API_URL } from './anthropic.js';
import { OPENAI_API_URL } from './openai.js';
import { DEFAULT_CLOUD_MODEL, buildOllamaChatUrl } from './ollama.js';
import { DEFAULT_MAX_COMMIT_LENGTH, DEFAULT_MAX_DIFF_BYTES } from './config.js';
import type { OllamaMode, ParsedArgs, Provider, UserConfig } from './types.js';

export type SettingSource = 'flag' | 'env' | 'saved' | 'default' | 'unset';

export interface EffectiveSetting {
  value?: string;
  label?: string;
  source: SettingSource;
  detail?: string;
}

export interface ProviderSetting extends EffectiveSetting {
  mode?: OllamaMode;
}

export interface EffectiveSettings {
  provider: ProviderSetting;
  model: EffectiveSetting;
  apiKey: EffectiveSetting;
  endpoint: EffectiveSetting;
  maxLength: EffectiveSetting;
  maxDiffBytes: EffectiveSetting;
}

export function getProviderLabel(provider: Provider, ollamaMode?: OllamaMode): string {
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'openai') return 'OpenAI';
  return ollamaMode === 'cloud' ? 'Ollama Cloud' : 'Local (Ollama)';
}

export function maskApiKey(key: string): string {
  if (key.length < 16) return '****';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

const API_KEY_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  'ollama-cloud': 'OLLAMA_API_KEY',
};

export interface ApiKeyLookup {
  key?: string;
  source: 'env' | 'saved' | 'unset';
  /** The env var this provider reads its key from; undefined when no key is required. */
  envVar?: string;
}

export function lookupApiKey(
  savedConfig: UserConfig,
  env: Record<string, string | undefined>,
  { provider, ollamaMode }: { provider: Provider; ollamaMode?: OllamaMode },
): ApiKeyLookup {
  const providerKey = ollamaMode === 'cloud' ? 'ollama-cloud' : provider;
  const envVar = API_KEY_ENV_VARS[providerKey];
  if (!envVar) return { source: 'unset' };

  const envKey = env[envVar]?.trim();
  if (envKey) return { key: envKey, source: 'env', envVar };

  const savedKey =
    providerKey === 'ollama-cloud'
      ? savedConfig.ollamaMode === 'cloud'
        ? savedConfig.apiKey
        : undefined
      : savedConfig.provider === provider
        ? savedConfig.apiKey
        : undefined;
  if (savedKey?.trim()) return { key: savedKey.trim(), source: 'saved', envVar };

  return { source: 'unset', envVar };
}

export interface EffectiveProvider {
  provider?: Provider;
  ollamaMode?: OllamaMode;
  setting: ProviderSetting;
}

function providerSetting(
  provider: Provider,
  ollamaMode: OllamaMode | undefined,
  source: SettingSource,
  detail?: string,
): EffectiveProvider {
  return {
    provider,
    ollamaMode,
    setting: {
      value: provider,
      mode: ollamaMode,
      label: getProviderLabel(provider, ollamaMode),
      source,
      detail,
    },
  };
}

export function resolveEffectiveProvider(
  args: ParsedArgs,
  savedConfig: UserConfig,
  env: Record<string, string | undefined>,
): EffectiveProvider {
  if (args.provider) {
    return providerSetting(args.provider, args.ollamaMode, 'flag');
  }
  if (env.ANTHROPIC_API_KEY?.trim()) {
    return providerSetting('anthropic', undefined, 'env', 'ANTHROPIC_API_KEY');
  }
  if (env.OPENAI_API_KEY?.trim()) {
    return providerSetting('openai', undefined, 'env', 'OPENAI_API_KEY');
  }
  if (env.OLLAMA_API_KEY?.trim()) {
    return providerSetting('ollama', 'cloud', 'env', 'OLLAMA_API_KEY');
  }
  if (savedConfig.provider) {
    return providerSetting(savedConfig.provider, savedConfig.ollamaMode, 'saved');
  }
  return { setting: { source: 'unset' } };
}

export function computeEffectiveSettings(
  args: ParsedArgs,
  savedConfig: UserConfig,
  env: Record<string, string | undefined>,
): EffectiveSettings {
  const {
    provider,
    ollamaMode,
    setting: providerSetting,
  } = resolveEffectiveProvider(args, savedConfig, env);

  const target = { provider, ollamaMode };

  return {
    provider: providerSetting,
    model: computeModel(args, savedConfig, target),
    apiKey: computeApiKey(savedConfig, env, target),
    endpoint: computeEndpoint(env, target),
    maxLength: computeLimit(args.maxLength, savedConfig.maxLength, DEFAULT_MAX_COMMIT_LENGTH),
    maxDiffBytes: computeLimit(args.maxDiffBytes, savedConfig.maxDiffBytes, DEFAULT_MAX_DIFF_BYTES),
  };
}

interface ProviderTarget {
  provider?: Provider;
  ollamaMode?: OllamaMode;
}

function computeModel(
  args: ParsedArgs,
  savedConfig: UserConfig,
  { provider, ollamaMode }: ProviderTarget,
): EffectiveSetting {
  if (args.model) return { value: args.model, source: 'flag' };

  // Saved model only applies when it was saved for the same provider (mirrors resolve.ts guards).
  const savedMatches =
    savedConfig.model &&
    savedConfig.provider === provider &&
    (provider !== 'ollama' || savedConfig.ollamaMode === ollamaMode);
  if (savedMatches) return { value: savedConfig.model, source: 'saved' };

  if (provider === 'ollama' && ollamaMode === 'cloud') {
    return { value: DEFAULT_CLOUD_MODEL, source: 'default' };
  }
  return { source: 'unset' };
}

function computeApiKey(
  savedConfig: UserConfig,
  env: Record<string, string | undefined>,
  { provider, ollamaMode }: ProviderTarget,
): EffectiveSetting {
  if (!provider) return { source: 'unset' };

  const lookup = lookupApiKey(savedConfig, env, { provider, ollamaMode });
  if (!lookup.envVar) return { source: 'unset', detail: 'not required' };
  if (!lookup.key) return { source: 'unset' };
  return {
    value: maskApiKey(lookup.key),
    source: lookup.source,
    detail: lookup.source === 'env' ? lookup.envVar : undefined,
  };
}

function computeEndpoint(
  env: Record<string, string | undefined>,
  { provider, ollamaMode }: ProviderTarget,
): EffectiveSetting {
  if (provider === 'anthropic') return { value: ANTHROPIC_API_URL, source: 'default' };
  if (provider === 'openai') return { value: OPENAI_API_URL, source: 'default' };
  if (provider === 'ollama') {
    const mode = ollamaMode ?? 'local';
    const url = buildOllamaChatUrl(mode, env);
    if (mode === 'local' && env.OLLAMA_HOST) {
      return { value: url, source: 'env', detail: 'OLLAMA_HOST' };
    }
    return { value: url, source: 'default' };
  }
  return { source: 'unset' };
}

function computeLimit(
  flagValue: number | undefined,
  savedValue: number | undefined,
  defaultValue: number,
): EffectiveSetting {
  if (flagValue !== undefined) return { value: String(flagValue), source: 'flag' };
  if (savedValue !== undefined) return { value: String(savedValue), source: 'saved' };
  return { value: String(defaultValue), source: 'default' };
}
