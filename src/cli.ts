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
import { promptUser, editMessage } from './tui.js';
import { createSpinner } from './spinner.js';
import {
  resolveProvider,
  resolveApiKey,
  resolveAnthropicModel,
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
  return ollamaMode === 'cloud' ? 'Ollama Cloud' : 'Local (Ollama)';
}

async function generate(diff: string, config: ReturnType<typeof buildConfig>): Promise<string> {
  const spinner = createSpinner('Generating commit message');
  try {
    const message =
      config.provider === 'anthropic'
        ? await generateAnthropicMessage(diff, config)
        : await generateOllamaMessage(diff, config);
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
  if (provider === 'anthropic') {
    apiKey = await resolveApiKey(
      env.ANTHROPIC_API_KEY,
      savedConfig.provider === 'anthropic' ? savedConfig.apiKey : undefined,
      { label: 'Anthropic', envVarName: 'ANTHROPIC_API_KEY' },
    );
  } else if (ollamaMode === 'cloud') {
    apiKey = await resolveApiKey(
      env.OLLAMA_API_KEY,
      savedConfig.ollamaMode === 'cloud' ? savedConfig.apiKey : undefined,
      { label: 'Ollama Cloud', envVarName: 'OLLAMA_API_KEY' },
    );
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
    (ollamaMode === 'cloud' || provider === 'anthropic') && !savedConfig.apiKey && !!apiKey;
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
