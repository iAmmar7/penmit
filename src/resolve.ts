import { ANTHROPIC_MODELS, ANTHROPIC_CUSTOM_MODEL } from './anthropic.js';
import { DEFAULT_CLOUD_MODEL, getLocalModels } from './ollama.js';
import { OPENAI_MODELS, OPENAI_CUSTOM_MODEL } from './openai.js';
import { selectFromList, promptInput } from './tui.js';
import { LLMError } from './errors.js';
import type { OllamaMode, ParsedArgs, Provider, UserConfig } from './types.js';

type ProviderPickerChoice = 'ollama-local' | 'ollama-cloud' | 'anthropic' | 'openai';

export async function resolveProvider(
  args: ParsedArgs,
  savedConfig: UserConfig,
  env: Record<string, string | undefined>,
): Promise<{ provider: Provider; ollamaMode?: OllamaMode; fromInteractive: boolean }> {
  // Priority: CLI flag > env var > saved config > interactive picker
  if (args.provider) {
    return { provider: args.provider, ollamaMode: args.ollamaMode, fromInteractive: false };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', fromInteractive: false };
  }
  if (env.OPENAI_API_KEY) {
    return { provider: 'openai', fromInteractive: false };
  }
  if (env.OLLAMA_API_KEY) {
    return { provider: 'ollama', ollamaMode: 'cloud', fromInteractive: false };
  }
  if (savedConfig.provider && !args.setup) {
    return {
      provider: savedConfig.provider,
      ollamaMode: savedConfig.ollamaMode,
      fromInteractive: false,
    };
  }

  const choice = await selectFromList<ProviderPickerChoice>('Provider:', [
    { label: 'Local', value: 'ollama-local', hint: 'private, uses your Ollama instance' },
    { label: 'Cloud', value: 'ollama-cloud', hint: 'Ollama Cloud, requires OLLAMA_API_KEY' },
    { label: 'Anthropic', value: 'anthropic', hint: 'Claude models, requires ANTHROPIC_API_KEY' },
    { label: 'OpenAI', value: 'openai', hint: 'Codex & GPT models, requires OPENAI_API_KEY' },
  ]);
  if (choice === 'anthropic') return { provider: 'anthropic', fromInteractive: true };
  if (choice === 'openai') return { provider: 'openai', fromInteractive: true };
  if (choice === 'ollama-cloud')
    return { provider: 'ollama', ollamaMode: 'cloud', fromInteractive: true };
  return { provider: 'ollama', ollamaMode: 'local', fromInteractive: true };
}

// Resolves an API key: env var > saved config > interactive prompt.
// Calls process.exit(1) if no key can be obtained in a non-TTY context.
export async function resolveApiKey(
  envKey: string | undefined,
  savedKey: string | undefined,
  { label, envVarName }: { label: string; envVarName: string },
): Promise<string> {
  const key = envKey?.trim() || savedKey?.trim();
  if (key) return key;

  if (!process.stdin.isTTY) {
    console.error(
      `${label} provider requires ${envVarName}.\nSet it with: ${envVarName}=... aicommit`,
    );
    process.exit(1);
  }

  const entered = await promptInput(`${label} API key: `);
  if (!entered) {
    console.error(`API key is required for ${label} provider.`);
    process.exit(1);
  }
  return entered;
}

export async function resolveAnthropicModel(
  args: ParsedArgs,
  savedConfig: UserConfig,
): Promise<{ model: string; fromInteractive: boolean }> {
  if (args.model) {
    return { model: args.model, fromInteractive: false };
  }
  if (!args.setup && savedConfig.provider === 'anthropic' && savedConfig.model) {
    return { model: savedConfig.model, fromInteractive: false };
  }

  const selected = await selectFromList<string>('Model:', [
    ...ANTHROPIC_MODELS.map((m) => ({ label: m.name, value: m.name, hint: m.hint })),
    { label: 'Enter model name...', value: ANTHROPIC_CUSTOM_MODEL },
  ]);

  if (selected === ANTHROPIC_CUSTOM_MODEL) {
    const model = await promptInput('Model name: ');
    if (!model) {
      console.error('Model name is required.');
      process.exit(1);
    }
    return { model, fromInteractive: true };
  }

  return { model: selected, fromInteractive: true };
}

export async function resolveOpenAIModel(
  args: ParsedArgs,
  savedConfig: UserConfig,
): Promise<{ model: string; fromInteractive: boolean }> {
  if (args.model) {
    return { model: args.model, fromInteractive: false };
  }
  if (!args.setup && savedConfig.provider === 'openai' && savedConfig.model) {
    return { model: savedConfig.model, fromInteractive: false };
  }

  const selected = await selectFromList<string>('Model:', [
    ...OPENAI_MODELS.map((m) => ({ label: m.name, value: m.name, hint: m.hint })),
    { label: 'Enter model name...', value: OPENAI_CUSTOM_MODEL },
  ]);

  if (selected === OPENAI_CUSTOM_MODEL) {
    const model = await promptInput('Model name: ');
    if (!model) {
      console.error('Model name is required.');
      process.exit(1);
    }
    return { model, fromInteractive: true };
  }

  return { model: selected, fromInteractive: true };
}

export async function resolveOllamaModel(
  args: ParsedArgs,
  savedConfig: UserConfig,
  { mode, tagsUrl }: { mode: OllamaMode; tagsUrl: string },
): Promise<{ model: string; fromInteractive: boolean }> {
  if (args.model) {
    return { model: args.model, fromInteractive: false };
  }

  if (mode === 'cloud') {
    const saved = savedConfig.ollamaMode === 'cloud' ? savedConfig.model : undefined;
    if (saved && !args.setup) {
      return { model: saved, fromInteractive: false };
    }
    const entered = await promptInput(`Cloud model [${DEFAULT_CLOUD_MODEL}]: `);
    return { model: entered || DEFAULT_CLOUD_MODEL, fromInteractive: true };
  }

  // Local: fetch installed models
  const models = await getLocalModels(tagsUrl);

  if (models.length === 0) {
    throw new LLMError('No local models found. Install one with:\n  ollama pull llama3.2');
  }

  // Saved model still installed and no --setup -> use it silently
  if (
    !args.setup &&
    savedConfig.provider === 'ollama' &&
    savedConfig.ollamaMode === 'local' &&
    savedConfig.model &&
    models.includes(savedConfig.model)
  ) {
    return { model: savedConfig.model, fromInteractive: false };
  }

  // One-time CLI provider override (--local without --setup) -> auto-pick first model
  if (args.provider && !args.setup) {
    return { model: models[0], fromInteractive: false };
  }

  // Interactive picker: first run or --setup
  const model = await selectFromList<string>(
    'Model:',
    models.map((m) => ({ label: m, value: m })),
  );
  return { model, fromInteractive: true };
}
