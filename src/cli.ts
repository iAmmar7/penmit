import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  parseArgs,
  buildConfig,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
  readUserConfig,
  writeUserConfig,
  DEFAULT_CLOUD_MODEL,
} from './config.js';
import { GitError, OllamaError } from './errors.js';
import { getStagedDiff, runCommit } from './git.js';
import { generateCommitMessage, getLocalModels } from './ollama.js';
import { promptUser, editMessage, selectFromList, promptInput } from './prompt.js';
import { createSpinner } from './spinner.js';
import type { ParsedArgs, Provider, UserConfig } from './types.js';

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

const HELP_TEXT = `
aicommit — AI-powered git commit message generator

Usage:
  aicommit [options]

Options:
  -m, --model <name>   Model to use (overrides saved default for this run)
  --local              Use local Ollama for this run
  --cloud              Use Ollama Cloud for this run
  --setup              Re-run the setup wizard to change saved defaults
  -v, --version        Print version
  -h, --help           Show this help

Environment variables:
  OLLAMA_API_KEY       Use Ollama Cloud (sets provider to cloud automatically)
  OLLAMA_HOST          Custom local Ollama host (default: localhost:11434)
  DEBUG=1              Print request/response debug info

Examples:
  aicommit
  aicommit --model mistral
  aicommit --cloud --model devstral-2
  aicommit --setup
  OLLAMA_API_KEY=sk-... aicommit
`.trim();

async function generate(diff: string, config: ReturnType<typeof buildConfig>) {
  const spinner = createSpinner('Generating commit message');
  try {
    const message = await generateCommitMessage(diff, config);
    spinner.stop();
    return message;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

async function resolveProvider(
  args: ParsedArgs,
  savedConfig: UserConfig,
  env: Record<string, string | undefined>,
): Promise<{ provider: Provider; fromInteractive: boolean }> {
  // Priority: CLI flag > env var > saved config > interactive picker
  if (args.provider) {
    return { provider: args.provider, fromInteractive: false };
  }
  if (env.OLLAMA_API_KEY) {
    return { provider: 'cloud', fromInteractive: false };
  }
  if (savedConfig.provider && !args.setup) {
    return { provider: savedConfig.provider, fromInteractive: false };
  }

  const provider = await selectFromList<Provider>('Provider:', [
    {
      label: 'Local',
      value: 'local',
      hint: 'private, uses your Ollama instance',
    },
    {
      label: 'Cloud',
      value: 'cloud',
      hint: 'Ollama Cloud, requires OLLAMA_API_KEY',
    },
  ]);
  return { provider, fromInteractive: true };
}

async function resolveModel(
  provider: Provider,
  args: ParsedArgs,
  savedConfig: UserConfig,
  tagsUrl: string,
): Promise<{ model: string; fromInteractive: boolean }> {
  // CLI flag always wins
  if (args.model) {
    return { model: args.model, fromInteractive: false };
  }

  if (provider === 'cloud') {
    const saved = savedConfig.provider === 'cloud' ? savedConfig.model : undefined;
    if (saved && !args.setup) {
      return { model: saved, fromInteractive: false };
    }
    const entered = await promptInput(`Cloud model [${DEFAULT_CLOUD_MODEL}]: `);
    return { model: entered || DEFAULT_CLOUD_MODEL, fromInteractive: true };
  }

  // Local: fetch installed models
  const models = await getLocalModels(tagsUrl);

  if (models.length === 0) {
    throw new OllamaError('No local models found. Install one with:\n  ollama pull llama3.1');
  }

  // Saved model still installed and no --setup -> use it silently
  if (
    !args.setup &&
    savedConfig.provider === 'local' &&
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
  let providerFromInteractive: boolean;
  try {
    const result = await resolveProvider(args, savedConfig, env);
    provider = result.provider;
    providerFromInteractive = result.fromInteractive;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Resolve API key for cloud: env var -> saved config -> prompt
  let apiKey: string | undefined;
  if (provider === 'cloud') {
    apiKey = env.OLLAMA_API_KEY ?? savedConfig.apiKey;
    if (!apiKey) {
      if (!process.stdin.isTTY) {
        console.error(
          'Cloud provider requires OLLAMA_API_KEY.\nSet it with: OLLAMA_API_KEY=your_key aicommit',
        );
        process.exit(1);
      }
      apiKey = await promptInput('Ollama Cloud API key: ');
      if (!apiKey) {
        console.error('API key is required for cloud provider.');
        process.exit(1);
      }
    }
  }

  const ollamaUrl = buildOllamaChatUrl(provider, env);
  const tagsUrl = buildOllamaTagsUrl(ollamaUrl);

  // Resolve model
  let model: string;
  let modelFromInteractive: boolean;
  try {
    const result = await resolveModel(provider, args, savedConfig, tagsUrl);
    model = result.model;
    modelFromInteractive = result.fromInteractive;
  } catch (err) {
    console.error(err instanceof OllamaError ? err.message : String(err));
    process.exit(1);
  }

  // Persist selection when interactive was used or a new API key was entered
  const apiKeyIsNew = provider === 'cloud' && !savedConfig.apiKey && !!apiKey;
  if (providerFromInteractive || modelFromInteractive || apiKeyIsNew) {
    const configToSave: UserConfig = { provider, model };
    if (apiKey !== undefined) configToSave.apiKey = apiKey;
    writeUserConfig(configToSave);
  }

  const config = buildConfig(provider, model, apiKey, env);

  // Show active provider + model
  const providerLabel = provider === 'local' ? 'Local' : 'Cloud';
  console.log(`Provider: ${providerLabel} - Model: ${model}`);

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
    console.error(err instanceof OllamaError ? err.message : String(err));
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
        console.error(err instanceof OllamaError ? err.message : String(err));
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
