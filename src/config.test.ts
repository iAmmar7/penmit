import { describe, it, expect, vi, afterEach } from 'vitest';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import {
  parseArgs,
  buildConfig,
  getUserConfigPath,
  readUserConfig,
  writeUserConfig,
  deleteUserConfig,
  readProjectConfig,
} from './config.js';
import { LOCAL_OLLAMA_URL, CLOUD_OLLAMA_URL, OLLAMA_CHAT_PATH } from './ollama.js';

describe('parseArgs', () => {
  it('returns defaults when no args given', () => {
    expect(parseArgs([])).toEqual({
      noRedact: false,
      help: false,
      version: false,
      setup: false,
      reset: false,
      yes: false,
    });
  });

  it('parses --help', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('parses -h shorthand', () => {
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('parses --version', () => {
    expect(parseArgs(['--version']).version).toBe(true);
  });

  it('parses -v shorthand', () => {
    expect(parseArgs(['-v']).version).toBe(true);
  });

  it('parses --model <name>', () => {
    expect(parseArgs(['--model', 'mistral']).model).toBe('mistral');
  });

  it('parses -m shorthand', () => {
    expect(parseArgs(['-m', 'codellama']).model).toBe('codellama');
  });

  it('parses --local', () => {
    const result = parseArgs(['--local']);
    expect(result.provider).toBe('ollama');
    expect(result.ollamaMode).toBe('local');
  });

  it('parses --cloud', () => {
    const result = parseArgs(['--cloud']);
    expect(result.provider).toBe('ollama');
    expect(result.ollamaMode).toBe('cloud');
  });

  it('parses --anthropic', () => {
    expect(parseArgs(['--anthropic']).provider).toBe('anthropic');
  });

  it('parses --openai', () => {
    expect(parseArgs(['--openai']).provider).toBe('openai');
  });

  it('parses --setup', () => {
    expect(parseArgs(['--setup']).setup).toBe(true);
  });

  it('parses --reset', () => {
    expect(parseArgs(['--reset']).reset).toBe(true);
  });

  it('parses --yes', () => {
    expect(parseArgs(['--yes']).yes).toBe(true);
  });

  it('parses -y shorthand', () => {
    expect(parseArgs(['-y']).yes).toBe(true);
  });

  it('parses combined flags', () => {
    const result = parseArgs(['--model', 'phi3', '--version']);
    expect(result.model).toBe('phi3');
    expect(result.version).toBe(true);
  });

  it('throws when --model has no value', () => {
    expect(() => parseArgs(['--model'])).toThrow(/requires a model name/);
  });

  it('throws when --model is followed by another flag', () => {
    expect(() => parseArgs(['--model', '--help'])).toThrow(/requires a model name/);
  });

  it('parses --max-length', () => {
    expect(parseArgs(['--max-length', '50']).maxLength).toBe(50);
  });

  it('throws when --max-length has no value', () => {
    expect(() => parseArgs(['--max-length'])).toThrow(/--max-length requires a positive integer/);
  });

  it('throws when --max-length is not a positive integer', () => {
    expect(() => parseArgs(['--max-length', '0'])).toThrow(
      /--max-length requires a positive integer/,
    );
    expect(() => parseArgs(['--max-length', '-5'])).toThrow(
      /--max-length requires a positive integer/,
    );
    expect(() => parseArgs(['--max-length', 'abc'])).toThrow(
      /--max-length requires a positive integer/,
    );
  });

  it('throws when --max-length is followed by a flag', () => {
    expect(() => parseArgs(['--max-length', '--help'])).toThrow(
      /--max-length requires a positive integer/,
    );
  });

  it('parses --no-redact', () => {
    expect(parseArgs(['--no-redact']).noRedact).toBe(true);
  });

  it('throws on unknown option', () => {
    expect(() => parseArgs(['--unknown'])).toThrow(/Unknown option/);
  });
});

describe('buildConfig', () => {
  it('builds local config correctly', () => {
    const config = buildConfig({}, { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' });
    expect(config.provider).toBe('ollama');
    expect(config.ollamaMode).toBe('local');
    expect(config.url).toBe(LOCAL_OLLAMA_URL);
    expect(config.model).toBe('llama3.2');
    expect(config.apiKey).toBeUndefined();
    expect(config.maxLength).toBe(72);
  });

  it('builds cloud config correctly', () => {
    const config = buildConfig(
      {},
      { provider: 'ollama', ollamaMode: 'cloud', model: 'devstral-2', apiKey: 'sk-test' },
    );
    expect(config.provider).toBe('ollama');
    expect(config.ollamaMode).toBe('cloud');
    expect(config.url).toBe(CLOUD_OLLAMA_URL);
    expect(config.model).toBe('devstral-2');
    expect(config.apiKey).toBe('sk-test');
    expect(config.maxLength).toBe(72);
  });

  it('builds anthropic config correctly', () => {
    const config = buildConfig(
      {},
      { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-ant-test' },
    );
    expect(config.provider).toBe('anthropic');
    expect(config.ollamaMode).toBeUndefined();
    expect(config.url).toBe('');
    expect(config.model).toBe('claude-sonnet-4-6');
    expect(config.apiKey).toBe('sk-ant-test');
    expect(config.maxLength).toBe(72);
  });

  it('builds openai config correctly', () => {
    const config = buildConfig(
      {},
      { provider: 'openai', model: 'codex-mini-latest', apiKey: 'sk-openai-test' },
    );
    expect(config.provider).toBe('openai');
    expect(config.ollamaMode).toBeUndefined();
    expect(config.url).toBe('');
    expect(config.model).toBe('codex-mini-latest');
    expect(config.apiKey).toBe('sk-openai-test');
    expect(config.maxLength).toBe(72);
  });

  it('uses custom maxLength when provided', () => {
    const config = buildConfig(
      {},
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2', maxLength: 50 },
    );
    expect(config.maxLength).toBe(50);
  });

  it('does not set apiKey for local even if apiKey arg is undefined', () => {
    const config = buildConfig(
      {
        OLLAMA_API_KEY: 'sk-test',
      },
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
    );
    expect(config.apiKey).toBeUndefined();
  });

  it('uses OLLAMA_HOST in local config', () => {
    const config = buildConfig(
      {
        OLLAMA_HOST: 'localhost:8080',
      },
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
    );
    expect(config.url).toBe(`http://localhost:8080${OLLAMA_CHAT_PATH}`);
  });

  it('uses OLLAMA_HOST with full URL', () => {
    const config = buildConfig(
      {
        OLLAMA_HOST: 'http://192.168.1.5:11434',
      },
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
    );
    expect(config.url).toBe(`http://192.168.1.5:11434${OLLAMA_CHAT_PATH}`);
  });

  it('uses OLLAMA_HOST with custom path as-is', () => {
    const config = buildConfig(
      {
        OLLAMA_HOST: 'http://myserver.com/ollama/api/chat',
      },
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
    );
    expect(config.url).toBe('http://myserver.com/ollama/api/chat');
  });

  it('ignores OLLAMA_HOST in cloud config', () => {
    const config = buildConfig(
      {
        OLLAMA_HOST: 'localhost:8080',
      },
      { provider: 'ollama', ollamaMode: 'cloud', model: 'devstral-2', apiKey: 'sk-test' },
    );
    expect(config.url).toBe(CLOUD_OLLAMA_URL);
  });
});

describe('getUserConfigPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  it('uses XDG_CONFIG_HOME on Linux when set', () => {
    setPlatform('linux');
    vi.stubEnv('XDG_CONFIG_HOME', '/custom/config');
    expect(getUserConfigPath()).toBe('/custom/config/penmit/config.json');
  });

  it('falls back to ~/.config on Linux when XDG_CONFIG_HOME is not set', () => {
    setPlatform('linux');
    vi.stubEnv('XDG_CONFIG_HOME', '');
    expect(getUserConfigPath()).toBe(join(homedir(), '.config', 'penmit', 'config.json'));
  });

  it('uses ~/.config on macOS by default', () => {
    setPlatform('darwin');
    vi.stubEnv('XDG_CONFIG_HOME', '');
    expect(getUserConfigPath()).toBe(join(homedir(), '.config', 'penmit', 'config.json'));
  });

  it('uses APPDATA on Windows when set', () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', 'C:\\Users\\user\\AppData\\Roaming');
    expect(getUserConfigPath()).toBe(
      join('C:\\Users\\user\\AppData\\Roaming', 'penmit', 'config.json'),
    );
  });

  it('falls back to ~/AppData/Roaming on Windows when APPDATA is not set', () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', '');
    expect(getUserConfigPath()).toBe(
      join(homedir(), 'AppData', 'Roaming', 'penmit', 'config.json'),
    );
  });
});

describe('readUserConfig', () => {
  it('reads and parses a valid config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'penmit-test-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ provider: 'ollama', model: 'llama3.2' }), 'utf8');
    expect(readUserConfig(configPath)).toEqual({ provider: 'ollama', model: 'llama3.2' });
    rmSync(dir, { recursive: true });
  });

  it('returns empty object when file does not exist', () => {
    expect(readUserConfig('/nonexistent/penmit-path/config.json')).toEqual({});
  });

  it('returns empty object when file contains invalid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'penmit-test-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, 'not valid json', 'utf8');
    expect(readUserConfig(configPath)).toEqual({});
    rmSync(dir, { recursive: true });
  });
});

describe('writeUserConfig', () => {
  it('creates nested directories and writes formatted JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'penmit-test-'));
    const configPath = join(dir, 'nested', 'config.json');
    const config = { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' };
    writeUserConfig(config, configPath);
    const written = readFileSync(configPath, 'utf8');
    expect(JSON.parse(written)).toEqual(config);
    rmSync(dir, { recursive: true });
  });
});

describe('deleteUserConfig', () => {
  it('returns false when file does not exist', () => {
    expect(deleteUserConfig('/nonexistent/penmit-path/config.json')).toBe(false);
  });

  it('deletes file and returns true when file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'penmit-test-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, '{}', 'utf8');
    expect(deleteUserConfig(configPath)).toBe(true);
    expect(existsSync(configPath)).toBe(false);
    rmSync(dir, { recursive: true });
  });
});

describe('readProjectConfig', () => {
  it('reads .penmitrc.json from the given directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'penmit-test-'));
    const config = {
      redactPatterns: [{ name: 'Custom Token', pattern: '\\bCUSTOM_[A-Z]{20}\\b' }],
    };
    writeFileSync(join(dir, '.penmitrc.json'), JSON.stringify(config), 'utf8');
    expect(readProjectConfig(dir)).toEqual(config);
    rmSync(dir, { recursive: true });
  });

  it('returns empty object when .penmitrc.json does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'penmit-test-'));
    expect(readProjectConfig(dir)).toEqual({});
    rmSync(dir, { recursive: true });
  });

  it('returns empty object when .penmitrc.json contains invalid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'penmit-test-'));
    writeFileSync(join(dir, '.penmitrc.json'), 'not json', 'utf8');
    expect(readProjectConfig(dir)).toEqual({});
    rmSync(dir, { recursive: true });
  });
});
