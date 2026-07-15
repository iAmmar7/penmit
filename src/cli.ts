import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  parseArgs,
  buildConfig,
  deleteUserConfig,
  getUserConfigPath,
  readUserConfig,
  readProjectConfig,
  writeUserConfig,
  DEFAULT_MAX_COMMIT_LENGTH,
  DEFAULT_MAX_DIFF_BYTES,
} from './config.js';
import { GitError, LLMError } from './errors.js';
import { getStagedDiff, runCommit } from './git.js';
import {
  generateCommitMessage as generateOllamaMessage,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
  getLocalModels,
  getCloudModels,
} from './ollama.js';
import {
  generateCommitMessage as generateAnthropicMessage,
  ANTHROPIC_MODELS,
} from './anthropic.js';
import { generateCommitMessage as generateOpenAIMessage, OPENAI_MODELS } from './openai.js';
import { promptUser, editMessage, confirm } from './tui.js';
import { createSpinner } from './spinner.js';
import {
  resolveProvider,
  resolveApiKey,
  resolveAnthropicModel,
  resolveOpenAIModel,
  resolveOllamaModel,
} from './resolve.js';
import { redactSecrets, isCloudProvider } from './redact.js';
import {
  computeEffectiveSettings,
  resolveEffectiveProvider,
  getProviderLabel,
  lookupApiKey,
  type EffectiveSetting,
} from './show-config.js';
import { HELP_TEXT } from './prompts.js';
import { log, colors, colorize } from './logger.js';
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

function runConfigCommand(args: ParsedArgs, env: Record<string, string | undefined>): void {
  const configPath = getUserConfigPath();
  const savedConfig = readUserConfig();
  const settings = computeEffectiveSettings(args, savedConfig, env);
  const configFileFound = existsSync(configPath);

  if (args.json) {
    log.info(
      JSON.stringify(
        { configFile: { path: configPath, found: configFileFound }, ...settings },
        null,
        2,
      ),
    );
    return;
  }

  const formatSource = (s: EffectiveSetting): string => {
    const label = s.detail ? `${s.source}: ${s.detail}` : s.source;
    return colorize(colors.dim, `(${label})`);
  };
  const formatValue = (s: EffectiveSetting): string => {
    if (s.value) return s.label ?? s.value;
    return s.detail === 'not required' ? '(not required)' : '(not set)';
  };
  const row = (label: string, s: EffectiveSetting): string =>
    `${label.padEnd(16)}${formatValue(s).padEnd(28)} ${formatSource(s)}`;

  log.info(
    `${'Config file:'.padEnd(16)}${configPath} ${colorize(colors.dim, configFileFound ? '(found)' : '(not found)')}`,
  );
  log.info(row('Provider:', settings.provider));
  log.info(row('Model:', settings.model));
  log.info(row('API key:', settings.apiKey));
  log.info(row('Endpoint:', settings.endpoint));
  log.info(row('Max length:', settings.maxLength));
  log.info(row('Max diff bytes:', settings.maxDiffBytes));

  if (settings.provider.source === 'unset') {
    log.info(colorize(colors.dim, '\nNo provider configured yet - run penmit to configure.'));
  }
}

async function runModelsCommand(
  args: ParsedArgs,
  env: Record<string, string | undefined>,
): Promise<void> {
  const savedConfig = readUserConfig();
  const { provider, ollamaMode } = resolveEffectiveProvider(args, savedConfig, env);

  if (!provider) {
    log.error(
      'No provider configured. Run penmit to set one up, or pass --local/--cloud/--anthropic/--openai.',
    );
    process.exit(1);
  }

  const label = getProviderLabel(provider, ollamaMode);
  let models: { name: string; hint?: string }[];
  let note: string | undefined;

  let cloudApiKey: string | undefined;
  if (ollamaMode === 'cloud') {
    cloudApiKey = lookupApiKey(savedConfig, env, { provider, ollamaMode }).key;
    if (!cloudApiKey) {
      log.error('Ollama Cloud requires an API key. Set it with: OLLAMA_API_KEY=... penmit models');
      process.exit(1);
    }
  }

  try {
    if (provider === 'anthropic') {
      models = ANTHROPIC_MODELS;
      note = 'Curated list - any Anthropic model name works with --model.';
    } else if (provider === 'openai') {
      models = OPENAI_MODELS;
      note = 'Curated list - any OpenAI model name works with --model.';
    } else if (ollamaMode === 'cloud') {
      models = (await getCloudModels(cloudApiKey!)).sort().map((name) => ({ name }));
      note = 'Catalog listing - some models are subscription-gated and may not run on a free tier.';
    } else {
      const tagsUrl = buildOllamaTagsUrl(buildOllamaChatUrl('local', env));
      models = (await getLocalModels(tagsUrl)).sort().map((name) => ({ name }));
      if (models.length === 0) note = 'No models installed. Pull one with: ollama pull llama3.2';
    }
  } catch (err) {
    log.error(err instanceof LLMError ? err.message : String(err));
    process.exit(1);
  }

  if (args.json) {
    log.info(
      JSON.stringify(
        { provider, mode: ollamaMode, label, models: models.map((m) => m.name), note },
        null,
        2,
      ),
    );
    return;
  }

  log.info(`Models for ${label}:`);
  for (const m of models) {
    log.info(m.hint ? `  ${m.name.padEnd(28)} ${colorize(colors.dim, m.hint)}` : `  ${m.name}`);
  }
  if (note) log.info(colorize(colors.dim, note));
}

const generators: Record<
  string,
  (diff: string, config: ReturnType<typeof buildConfig>) => Promise<string>
> = {
  anthropic: generateAnthropicMessage,
  openai: generateOpenAIMessage,
  ollama: generateOllamaMessage,
};

function enforceCommitLength(message: string, maxLength: number): string {
  const line = message.trim();
  if (line.length <= maxLength) return line;

  // Truncate at the last word boundary within the limit
  const truncated = line.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const result = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  log.warn(`Warning: commit message truncated to ${maxLength} characters.`);
  return result;
}

async function generate(diff: string, config: ReturnType<typeof buildConfig>): Promise<string> {
  const spinner = createSpinner('Generating commit message');
  try {
    const message = await generators[config.provider](diff, config);
    spinner.stop();
    return enforceCommitLength(message, config.maxLength);
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
    log.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (args.help) {
    log.info(HELP_TEXT);
    return;
  }

  if (args.version) {
    log.info(getVersion());
    return;
  }

  if (args.command === 'config') {
    runConfigCommand(args, env);
    return;
  }

  if (args.command === 'models') {
    await runModelsCommand(args, env);
    return;
  }

  if (args.reset) {
    const configPath = getUserConfigPath();
    if (!existsSync(configPath)) {
      log.info('No saved settings found - nothing to reset.');
      return;
    }
    if (!args.yes) {
      const ok = await confirm(`Reset saved settings? This will delete ${configPath}.`);
      if (!ok) {
        log.info('Aborted.');
        return;
      }
    }
    deleteUserConfig(configPath);
    log.info('Settings reset. Run penmit to configure again.');
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
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Resolve API key (only for providers that require one)
  let apiKey: string | undefined;
  const keyLookup = lookupApiKey(savedConfig, env, { provider, ollamaMode });
  if (keyLookup.envVar) {
    apiKey = await resolveApiKey(keyLookup.key, undefined, {
      label: getProviderLabel(provider, ollamaMode),
      envVarName: keyLookup.envVar,
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
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else if (provider === 'openai') {
    try {
      const result = await resolveOpenAIModel(args, savedConfig);
      model = result.model;
      modelFromInteractive = result.fromInteractive;
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
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
      log.error(err instanceof LLMError ? err.message : String(err));
      process.exit(1);
    }
  }

  const maxLength = args.maxLength ?? savedConfig.maxLength ?? DEFAULT_MAX_COMMIT_LENGTH;
  const maxDiffBytes = args.maxDiffBytes ?? savedConfig.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;

  // Persist selection when interactive was used, a new API key was entered, or maxLength was set
  const shouldSave =
    providerFromInteractive ||
    modelFromInteractive ||
    (!savedConfig.apiKey && !!apiKey) ||
    args.maxLength !== undefined ||
    args.maxDiffBytes !== undefined;

  if (shouldSave) {
    const configToSave: UserConfig = { provider, model };
    if (provider === 'ollama') configToSave.ollamaMode = ollamaMode;
    if (apiKey !== undefined) configToSave.apiKey = apiKey;
    if (args.maxLength !== undefined) configToSave.maxLength = args.maxLength;
    if (args.maxDiffBytes !== undefined) configToSave.maxDiffBytes = args.maxDiffBytes;
    writeUserConfig(configToSave);
  }

  const config = buildConfig(env, {
    provider,
    ollamaMode,
    model,
    apiKey,
    maxLength,
  });

  log.info(`Provider: ${getProviderLabel(provider, ollamaMode)} - Model: ${model}`);

  // Get staged diff
  let diff: string;
  try {
    diff = getStagedDiff();
  } catch (err) {
    log.error(err instanceof GitError ? err.message : String(err));
    process.exit(1);
  }

  if (!diff.trim()) {
    log.error('No staged changes found. Stage your changes with "git add" first.');
    process.exit(1);
  }

  // Check diff size against limit
  const diffBytes = Buffer.byteLength(diff, 'utf8');
  if (diffBytes > maxDiffBytes) {
    const sizeKB = (diffBytes / 1024).toFixed(1);
    const limitKB = (maxDiffBytes / 1024).toFixed(1);
    log.warn(`Staged diff is ${sizeKB}KB, which exceeds the ${limitKB}KB limit.`);
    log.warn('Large diffs may be slow/expensive to process and produce lower-quality messages.');
    if (!args.yes) {
      const proceed = await confirm('Proceed anyway?');
      if (!proceed) {
        log.info(
          'Aborted. Consider staging fewer files or using --max-diff-bytes to adjust the limit.',
        );
        process.exit(0);
      }
    }
  }

  // Redact secrets before sending to cloud providers
  if (isCloudProvider(provider, ollamaMode) && args.noRedact) {
    log.warn(
      `Secret redaction is disabled. Your diff will be sent to ${getProviderLabel(provider, ollamaMode)} without redaction.`,
    );
  }
  if (isCloudProvider(provider, ollamaMode) && !args.noRedact) {
    const projectConfig = readProjectConfig();
    const customPatterns = [
      ...(projectConfig.redactPatterns ?? []),
      ...(savedConfig.redactPatterns ?? []),
    ];
    const { redacted, count } = redactSecrets(diff, customPatterns);
    if (count > 0) {
      log.warn(
        `Redacted ${count} potential secret(s) from the diff before sending to ${getProviderLabel(provider, ollamaMode)}.`,
      );
      diff = redacted;
    }
  }

  let message: string;
  try {
    message = await generate(diff, config);
  } catch (err) {
    log.error(err instanceof LLMError ? err.message : String(err));
    process.exit(1);
  }

  while (true) {
    const choice = await promptUser(message);

    if (choice === 'accept') {
      const status = runCommit(message);
      if (status !== 0) process.exit(status);
      break;
    } else if (choice === 'regenerate') {
      log.info('Regenerating...');
      try {
        message = await generate(diff, config);
      } catch (err) {
        log.error(err instanceof LLMError ? err.message : String(err));
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
