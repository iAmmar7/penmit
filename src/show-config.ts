import { ANTHROPIC_API_URL } from './anthropic.js';
import { OPENAI_API_URL } from './openai.js';
import { DEFAULT_CLOUD_MODEL, buildOllamaChatUrl } from './ollama.js';
import { DEFAULT_MAX_COMMIT_LENGTH, DEFAULT_MAX_DIFF_BYTES } from './config.js';
import type { OllamaMode, ParsedArgs, Provider, UserConfig } from './types.js';

export type SettingSource = 'flag' | 'env' | 'saved' | 'default' | 'unset';

export interface EffectiveSetting {
  value?: string;
  source: SettingSource;
  detail?: string;
}

export interface EffectiveSettings {
  provider: EffectiveSetting;
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
  if (key.length < 8) return '****';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

const API_KEY_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  'ollama-cloud': 'OLLAMA_API_KEY',
};

export interface EffectiveProvider {
  provider?: Provider;
  ollamaMode?: OllamaMode;
  setting: EffectiveSetting;
}

export function resolveEffectiveProvider(
  args: ParsedArgs,
  savedConfig: UserConfig,
  env: Record<string, string | undefined>,
): EffectiveProvider {
  if (args.provider) {
    return {
      provider: args.provider,
      ollamaMode: args.ollamaMode,
      setting: { value: getProviderLabel(args.provider, args.ollamaMode), source: 'flag' },
    };
  }
  if (env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      setting: { value: 'Anthropic', source: 'env', detail: 'ANTHROPIC_API_KEY' },
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      setting: { value: 'OpenAI', source: 'env', detail: 'OPENAI_API_KEY' },
    };
  }
  if (env.OLLAMA_API_KEY) {
    return {
      provider: 'ollama',
      ollamaMode: 'cloud',
      setting: { value: 'Ollama Cloud', source: 'env', detail: 'OLLAMA_API_KEY' },
    };
  }
  if (savedConfig.provider) {
    return {
      provider: savedConfig.provider,
      ollamaMode: savedConfig.ollamaMode,
      setting: {
        value: getProviderLabel(savedConfig.provider, savedConfig.ollamaMode),
        source: 'saved',
      },
    };
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

  return {
    provider: providerSetting,
    model: computeModel(args, savedConfig, provider, ollamaMode),
    apiKey: computeApiKey(savedConfig, env, provider, ollamaMode),
    endpoint: computeEndpoint(env, provider, ollamaMode),
    maxLength: computeLimit(args.maxLength, savedConfig.maxLength, DEFAULT_MAX_COMMIT_LENGTH),
    maxDiffBytes: computeLimit(
      args.maxDiffBytes,
      savedConfig.maxDiffBytes,
      DEFAULT_MAX_DIFF_BYTES,
    ),
  };
}

function computeModel(
  args: ParsedArgs,
  savedConfig: UserConfig,
  provider: Provider | undefined,
  ollamaMode: OllamaMode | undefined,
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
  provider: Provider | undefined,
  ollamaMode: OllamaMode | undefined,
): EffectiveSetting {
  if (!provider) return { source: 'unset' };

  const providerKey = ollamaMode === 'cloud' ? 'ollama-cloud' : provider;
  const envVar = API_KEY_ENV_VARS[providerKey];
  if (!envVar) return { source: 'unset', detail: 'not required' };

  const envKey = env[envVar]?.trim();
  if (envKey) return { value: maskApiKey(envKey), source: 'env', detail: envVar };

  // Saved key only applies when saved for the same provider (mirrors cli.ts guards).
  const savedMatches =
    savedConfig.apiKey &&
    (providerKey === 'ollama-cloud'
      ? savedConfig.ollamaMode === 'cloud'
      : savedConfig.provider === provider);
  if (savedMatches) return { value: maskApiKey(savedConfig.apiKey!), source: 'saved' };

  return { source: 'unset' };
}

function computeEndpoint(
  env: Record<string, string | undefined>,
  provider: Provider | undefined,
  ollamaMode: OllamaMode | undefined,
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
