import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import type { Config, ParsedArgs, Provider, UserConfig } from './types.js';

export const OLLAMA_CHAT_PATH = '/api/chat';
export const OLLAMA_TAGS_PATH = '/api/tags';
export const LOCAL_OLLAMA_URL = `http://localhost:11434${OLLAMA_CHAT_PATH}`;
export const CLOUD_OLLAMA_URL = `https://ollama.com${OLLAMA_CHAT_PATH}`;
export const DEFAULT_CLOUD_MODEL = 'devstral-small-2:24b';

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
        result.provider = 'local';
        break;
      case '--cloud':
        result.provider = 'cloud';
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

// OLLAMA_HOST is Ollama's own env var for configuring the server address.
// The Ollama client (ollama run, ollama pull, etc.) also reads it to know where to connect.
// Ref: https://github.com/ollama/ollama/blob/main/api/client.go
function buildLocalOllamaUrl(env: Record<string, string | undefined>): string {
  const host = env.OLLAMA_HOST;
  if (!host) return LOCAL_OLLAMA_URL;

  const base = host.includes('://') ? host : `http://${host}`;
  const url = new URL(base);

  // If user provided a custom path, use the URL as-is
  if (url.pathname !== '/') return base.replace(/\/$/, '');

  // Otherwise append the standard Ollama path
  return `${base.replace(/\/$/, '')}${OLLAMA_CHAT_PATH}`;
}

export function buildOllamaChatUrl(
  provider: Provider,
  env: Record<string, string | undefined> = process.env,
): string {
  if (provider === 'cloud') return CLOUD_OLLAMA_URL;
  return buildLocalOllamaUrl(env);
}

export function buildOllamaTagsUrl(ollamaUrl: string): string {
  return ollamaUrl.replace(OLLAMA_CHAT_PATH, OLLAMA_TAGS_PATH);
}

export function buildConfig(
  provider: Provider,
  model: string,
  apiKey: string | undefined,
  env: Record<string, string | undefined> = process.env,
): Config {
  return {
    provider,
    ollamaUrl: buildOllamaChatUrl(provider, env),
    model,
    apiKey,
    debug: env.DEBUG === '1',
  };
}
