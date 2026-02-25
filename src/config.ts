import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import type { Config, OllamaMode, ParsedArgs, Provider, UserConfig } from './types.js';
import { buildOllamaChatUrl } from './ollama.js';

export function getUserConfigPath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'aicommit', 'config.json');
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, '.config');
  return join(xdgConfig, 'aicommit', 'config.json');
}

export function readUserConfig(configPath = getUserConfigPath()): UserConfig {
  try {
    const raw = readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as UserConfig;
  } catch {
    return {};
  }
}

export function writeUserConfig(config: UserConfig, configPath = getUserConfigPath()): void {
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { help: false, version: false, setup: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--version':
      case '-v':
        result.version = true;
        break;
      case '--local':
        result.provider = 'ollama';
        result.ollamaMode = 'local';
        break;
      case '--cloud':
        result.provider = 'ollama';
        result.ollamaMode = 'cloud';
        break;
      case '--anthropic':
        result.provider = 'anthropic';
        break;
      case '--setup':
        result.setup = true;
        break;
      case '--model':
      case '-m': {
        const next = argv[i + 1];
        if (!next || next.startsWith('-')) {
          throw new Error(`${arg} requires a model name (e.g. --model mistral)`);
        }
        result.model = next;
        i++;
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return result;
}

export function buildConfig(
  {
    provider,
    ollamaMode,
    model,
    apiKey,
  }: { provider: Provider; ollamaMode?: OllamaMode; model: string; apiKey?: string },
  env: Record<string, string | undefined> = process.env,
): Config {
  const resolvedMode = provider === 'ollama' ? (ollamaMode ?? 'local') : undefined;
  return {
    provider,
    ollamaMode: resolvedMode,
    url: provider === 'ollama' ? buildOllamaChatUrl(resolvedMode!, env) : '',
    model,
    apiKey,
    debug: env.DEBUG === '1',
  };
}
