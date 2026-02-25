import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, buildConfig, readUserConfig, writeUserConfig } from './config.js';
import { GitError, LLMError } from './errors.js';
import { getStagedDiff, runCommit } from './git.js';
import {
  generateCommitMessage as generateOllamaMessage,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
} from './ollama.js';
import { generateCommitMessage as generateAnthropicMessage } from './anthropic.js';
import { generateCommitMessage as generateOpenAIMessage } from './openai.js';
import { promptUser, editMessage } from './tui.js';
import { createSpinner } from './spinner.js';
import {
  resolveProvider,
  resolveApiKey,
  resolveAnthropicModel,
  resolveOpenAIModel,
  resolveOllamaModel,
} from './resolve.js';
import { HELP_TEXT } from './prompts.js';
import type { OllamaMode, ParsedArgs, Provider, UserConfig } from './types.js';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

function getProviderLabel(provider: Provider, ollamaMode?: OllamaMode): string {
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'openai') return 'OpenAI';
  return ollamaMode === 'cloud' ? 'Ollama Cloud' : 'Local (Ollama)';
}

const generators: Record<
  string,
  (diff: string, config: ReturnType<typeof buildConfig>) => Promise<string>
> = {
  anthropic: generateAnthropicMessage,
  openai: generateOpenAIMessage,
  ollama: generateOllamaMessage,
};

async function generate(diff: string, config: ReturnType<typeof buildConfig>): Promise<string> {
  const spinner = createSpinner('Generating commit message');
  try {
    const message = await generators[config.provider](diff, config);
    spinner.stop();
    return message;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

export async function run(
  argv: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  let args: ParsedArgs | null = null;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (args.version) {
    console.log(getVersion());
    return;
  }

  const savedConfig = readUserConfig();

  // Resolve provider
  let provider: Provider;
  let ollamaMode: OllamaMode | undefined;
  let providerFromInteractive: boolean;
  try {
    const result = await resolveProvider(args, savedConfig, env);
    provider = result.provider;
    ollamaMode = result.ollamaMode;
    providerFromInteractive = result.fromInteractive;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Resolve API key (only for providers that require one)
  let apiKey: string | undefined;
  const providerKey = ollamaMode === 'cloud' ? 'ollama-cloud' : provider;
  const apiKeyConfigs: Partial<
    Record<string, { envVar: string; label: string; savedKey: string | undefined }>
  > = {
    anthropic: {
      envVar: 'ANTHROPIC_API_KEY',
      label: 'Anthropic',
      savedKey: savedConfig.provider === 'anthropic' ? savedConfig.apiKey : undefined,
    },
    openai: {
      envVar: 'OPENAI_API_KEY',
      label: 'OpenAI',
      savedKey: savedConfig.provider === 'openai' ? savedConfig.apiKey : undefined,
    },
    'ollama-cloud': {
      envVar: 'OLLAMA_API_KEY',
      label: 'Ollama Cloud',
      savedKey: savedConfig.ollamaMode === 'cloud' ? savedConfig.apiKey : undefined,
    },
  };
  const keyConf = apiKeyConfigs[providerKey];
  if (keyConf) {
    apiKey = await resolveApiKey(env[keyConf.envVar], keyConf.savedKey, {
      label: keyConf.label,
      envVarName: keyConf.envVar,
    });
  }

  // Resolve model
  let model: string;
  let modelFromInteractive: boolean;
  if (provider === 'anthropic') {
    try {
      const result = await resolveAnthropicModel(args, savedConfig);
      model = result.model;
      modelFromInteractive = result.fromInteractive;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else if (provider === 'openai') {
    try {
      const result = await resolveOpenAIModel(args, savedConfig);
      model = result.model;
      modelFromInteractive = result.fromInteractive;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else {
    const chatUrl = buildOllamaChatUrl(ollamaMode ?? 'local', env);
    const tagsUrl = buildOllamaTagsUrl(chatUrl);
    try {
      const result = await resolveOllamaModel(args, savedConfig, {
        mode: ollamaMode ?? 'local',
        tagsUrl,
      });
      model = result.model;
      modelFromInteractive = result.fromInteractive;
    } catch (err) {
      console.error(err instanceof LLMError ? err.message : String(err));
      process.exit(1);
    }
  }

  // Persist selection when interactive was used or a new API key was entered
  const apiKeyIsNew =
    (ollamaMode === 'cloud' || provider === 'anthropic' || provider === 'openai') &&
    !savedConfig.apiKey &&
    !!apiKey;
  if (providerFromInteractive || modelFromInteractive || apiKeyIsNew) {
    const configToSave: UserConfig = { provider, model };
    if (provider === 'ollama') configToSave.ollamaMode = ollamaMode;
    if (apiKey !== undefined) configToSave.apiKey = apiKey;
    writeUserConfig(configToSave);
  }

  const config = buildConfig({ provider, ollamaMode, model, apiKey }, env);

  console.log(`Provider: ${getProviderLabel(provider, ollamaMode)} - Model: ${model}`);

  // Get staged diff
  let diff: string;
  try {
    diff = getStagedDiff();
  } catch (err) {
    console.error(err instanceof GitError ? err.message : String(err));
    process.exit(1);
  }

  if (!diff.trim()) {
    console.error('No staged changes found. Stage your changes with "git add" first.');
    process.exit(1);
  }

  let message: string;
  try {
    message = await generate(diff, config);
  } catch (err) {
    console.error(err instanceof LLMError ? err.message : String(err));
    process.exit(1);
  }

  while (true) {
    const choice = await promptUser(message);

    if (choice === 'accept') {
      const status = runCommit(message);
      if (status !== 0) process.exit(status);
      break;
    } else if (choice === 'regenerate') {
      console.log('Regenerating...');
      try {
        message = await generate(diff, config);
      } catch (err) {
        console.error(err instanceof LLMError ? err.message : String(err));
        process.exit(1);
      }
    } else {
      message = await editMessage(message);
      const status = runCommit(message);
      if (status !== 0) process.exit(status);
      break;
    }
  }
}
