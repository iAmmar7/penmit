import { describe, it, expect, vi, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { parseArgs, buildConfig, getUserConfigPath } from './config.js';
import { LOCAL_OLLAMA_URL, CLOUD_OLLAMA_URL, OLLAMA_CHAT_PATH } from './ollama.js';

describe('parseArgs', () => {
  it('returns defaults when no args given', () => {
    expect(parseArgs([])).toEqual({
      help: false,
      version: false,
      setup: false,
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

  it('throws on unknown option', () => {
    expect(() => parseArgs(['--unknown'])).toThrow(/Unknown option/);
  });
});

describe('buildConfig', () => {
  it('builds local config correctly', () => {
    const config = buildConfig({ provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' }, {});
    expect(config.provider).toBe('ollama');
    expect(config.ollamaMode).toBe('local');
    expect(config.url).toBe(LOCAL_OLLAMA_URL);
    expect(config.model).toBe('llama3.2');
    expect(config.apiKey).toBeUndefined();
    expect(config.debug).toBe(false);
  });

  it('builds cloud config correctly', () => {
    const config = buildConfig(
      { provider: 'ollama', ollamaMode: 'cloud', model: 'devstral-2', apiKey: 'sk-test' },
      {},
    );
    expect(config.provider).toBe('ollama');
    expect(config.ollamaMode).toBe('cloud');
    expect(config.url).toBe(CLOUD_OLLAMA_URL);
    expect(config.model).toBe('devstral-2');
    expect(config.apiKey).toBe('sk-test');
  });

  it('builds anthropic config correctly', () => {
    const config = buildConfig(
      { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-ant-test' },
      {},
    );
    expect(config.provider).toBe('anthropic');
    expect(config.ollamaMode).toBeUndefined();
    expect(config.url).toBe('');
    expect(config.model).toBe('claude-sonnet-4-6');
    expect(config.apiKey).toBe('sk-ant-test');
  });

  it('builds openai config correctly', () => {
    const config = buildConfig(
      { provider: 'openai', model: 'codex-mini-latest', apiKey: 'sk-openai-test' },
      {},
    );
    expect(config.provider).toBe('openai');
    expect(config.ollamaMode).toBeUndefined();
    expect(config.url).toBe('');
    expect(config.model).toBe('codex-mini-latest');
    expect(config.apiKey).toBe('sk-openai-test');
    expect(config.debug).toBe(false);
  });

  it('does not set apiKey for local even if apiKey arg is undefined', () => {
    const config = buildConfig(
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
      {
        OLLAMA_API_KEY: 'sk-test',
      },
    );
    expect(config.apiKey).toBeUndefined();
  });

  it('sets debug=true when DEBUG=1', () => {
    expect(
      buildConfig({ provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' }, { DEBUG: '1' })
        .debug,
    ).toBe(true);
  });

  it('sets debug=false when DEBUG is absent', () => {
    expect(
      buildConfig({ provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' }, {}).debug,
    ).toBe(false);
  });

  it('uses OLLAMA_HOST in local config', () => {
    const config = buildConfig(
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
      {
        OLLAMA_HOST: 'localhost:8080',
      },
    );
    expect(config.url).toBe(`http://localhost:8080${OLLAMA_CHAT_PATH}`);
  });

  it('uses OLLAMA_HOST with full URL', () => {
    const config = buildConfig(
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
      {
        OLLAMA_HOST: 'http://192.168.1.5:11434',
      },
    );
    expect(config.url).toBe(`http://192.168.1.5:11434${OLLAMA_CHAT_PATH}`);
  });

  it('uses OLLAMA_HOST with custom path as-is', () => {
    const config = buildConfig(
      { provider: 'ollama', ollamaMode: 'local', model: 'llama3.2' },
      {
        OLLAMA_HOST: 'http://myserver.com/ollama/api/chat',
      },
    );
    expect(config.url).toBe('http://myserver.com/ollama/api/chat');
  });

  it('ignores OLLAMA_HOST in cloud config', () => {
    const config = buildConfig(
      { provider: 'ollama', ollamaMode: 'cloud', model: 'devstral-2', apiKey: 'sk-test' },
      {
        OLLAMA_HOST: 'localhost:8080',
      },
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
    expect(getUserConfigPath()).toBe('/custom/config/aicommit/config.json');
  });

  it('falls back to ~/.config on Linux when XDG_CONFIG_HOME is not set', () => {
    setPlatform('linux');
    vi.stubEnv('XDG_CONFIG_HOME', '');
    expect(getUserConfigPath()).toBe(join(homedir(), '.config', 'aicommit', 'config.json'));
  });

  it('uses ~/.config on macOS by default', () => {
    setPlatform('darwin');
    vi.stubEnv('XDG_CONFIG_HOME', '');
    expect(getUserConfigPath()).toBe(join(homedir(), '.config', 'aicommit', 'config.json'));
  });

  it('uses APPDATA on Windows when set', () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', 'C:\\Users\\user\\AppData\\Roaming');
    expect(getUserConfigPath()).toBe(
      join('C:\\Users\\user\\AppData\\Roaming', 'aicommit', 'config.json'),
    );
  });

  it('falls back to ~/AppData/Roaming on Windows when APPDATA is not set', () => {
    setPlatform('win32');
    vi.stubEnv('APPDATA', '');
    expect(getUserConfigPath()).toBe(
      join(homedir(), 'AppData', 'Roaming', 'aicommit', 'config.json'),
    );
  });
});
