import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import type {
  Config,
  OllamaMode,
  ParsedArgs,
  ProjectConfig,
  Provider,
  UserConfig,
} from './types.js';
import { buildOllamaChatUrl } from './ollama.js';

export const DEFAULT_MAX_COMMIT_LENGTH = 72;

export function getUserConfigPath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'penmit', 'config.json');
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, '.config');
  return join(xdgConfig, 'penmit', 'config.json');
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

export function deleteUserConfig(configPath = getUserConfigPath()): boolean {
  if (!existsSync(configPath)) return false;
  rmSync(configPath);
  return true;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    noRedact: false,
    help: false,
    version: false,
    setup: false,
    reset: false,
    yes: false,
  };

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
      case '--openai':
        result.provider = 'openai';
        break;
      case '--setup':
        result.setup = true;
        break;
      case '--reset':
        result.reset = true;
        break;
      case '--yes':
      case '-y':
        result.yes = true;
        break;
      case '--no-redact':
        result.noRedact = true;
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
      case '--max-length': {
        const next = argv[i + 1];
        const parsed = parseInt(next ?? '', 10);
        if (!next || isNaN(parsed) || parsed < 1) {
          throw new Error(`--max-length requires a positive integer (e.g. --max-length 72)`);
        }
        result.maxLength = parsed;
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
  env: Record<string, string | undefined> = process.env,
  {
    provider,
    ollamaMode,
    model,
    apiKey,
    maxLength,
  }: {
    provider: Provider;
    ollamaMode?: OllamaMode;
    model: string;
    apiKey?: string;
    maxLength?: number;
  },
): Config {
  const resolvedMode = provider === 'ollama' ? (ollamaMode ?? 'local') : undefined;
  return {
    provider,
    ollamaMode: resolvedMode,
    url: provider === 'ollama' ? buildOllamaChatUrl(resolvedMode!, env) : '',
    model,
    apiKey,
    maxLength: maxLength ?? DEFAULT_MAX_COMMIT_LENGTH,
  };
}

export function readProjectConfig(cwd = process.cwd()): ProjectConfig {
  try {
    const raw = readFileSync(join(cwd, '.penmitrc.json'), 'utf8');
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return {};
  }
}
