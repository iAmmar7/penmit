import { describe, it, expect, vi, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import {
  parseArgs,
  buildConfig,
  buildOllamaChatUrl,
  buildOllamaTagsUrl,
  getUserConfigPath,
  LOCAL_OLLAMA_URL,
  CLOUD_OLLAMA_URL,
  OLLAMA_CHAT_PATH,
  OLLAMA_TAGS_PATH,
  DEFAULT_CLOUD_MODEL,
} from './config.js';

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
    expect(parseArgs(['--local']).provider).toBe('local');
  });

  it('parses --cloud', () => {
    expect(parseArgs(['--cloud']).provider).toBe('cloud');
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

describe('buildOllamaChatUrl', () => {
  it('returns local URL when provider is local and no OLLAMA_HOST', () => {
    expect(buildOllamaChatUrl('local', {})).toBe(LOCAL_OLLAMA_URL);
  });

  it('returns cloud URL when provider is cloud', () => {
    expect(buildOllamaChatUrl('cloud', {})).toBe(CLOUD_OLLAMA_URL);
  });

  it('uses OLLAMA_HOST with host:port for local', () => {
    expect(buildOllamaChatUrl('local', { OLLAMA_HOST: 'localhost:8080' })).toBe(
      `http://localhost:8080${OLLAMA_CHAT_PATH}`,
    );
  });

  it('ignores OLLAMA_HOST for cloud', () => {
    expect(buildOllamaChatUrl('cloud', { OLLAMA_HOST: 'localhost:8080' })).toBe(CLOUD_OLLAMA_URL);
  });
});

describe('buildConfig', () => {
  it('builds local config correctly', () => {
    const config = buildConfig('local', 'llama3.1', undefined, {});
    expect(config.provider).toBe('local');
    expect(config.ollamaUrl).toBe(LOCAL_OLLAMA_URL);
    expect(config.model).toBe('llama3.1');
    expect(config.apiKey).toBeUndefined();
    expect(config.debug).toBe(false);
  });

  it('builds cloud config correctly', () => {
    const config = buildConfig('cloud', 'devstral-2', 'sk-test', {});
    expect(config.provider).toBe('cloud');
    expect(config.ollamaUrl).toBe(CLOUD_OLLAMA_URL);
    expect(config.model).toBe('devstral-2');
    expect(config.apiKey).toBe('sk-test');
  });

  it('does not set apiKey for local even if apiKey arg is undefined', () => {
    const config = buildConfig('local', 'llama3.1', undefined, {
      OLLAMA_API_KEY: 'sk-test',
    });
    expect(config.apiKey).toBeUndefined();
  });

  it('sets debug=true when DEBUG=1', () => {
    expect(buildConfig('local', 'llama3.1', undefined, { DEBUG: '1' }).debug).toBe(true);
  });

  it('sets debug=false when DEBUG is absent', () => {
    expect(buildConfig('local', 'llama3.1', undefined, {}).debug).toBe(false);
  });

  it('uses OLLAMA_HOST in local config', () => {
    const config = buildConfig('local', 'llama3.1', undefined, {
      OLLAMA_HOST: 'localhost:8080',
    });
    expect(config.ollamaUrl).toBe(`http://localhost:8080${OLLAMA_CHAT_PATH}`);
  });

  it('uses OLLAMA_HOST with full URL', () => {
    const config = buildConfig('local', 'llama3.1', undefined, {
      OLLAMA_HOST: 'http://192.168.1.5:11434',
    });
    expect(config.ollamaUrl).toBe(`http://192.168.1.5:11434${OLLAMA_CHAT_PATH}`);
  });

  it('uses OLLAMA_HOST with custom path as-is', () => {
    const config = buildConfig('local', 'llama3.1', undefined, {
      OLLAMA_HOST: 'http://myserver.com/ollama/api/chat',
    });
    expect(config.ollamaUrl).toBe('http://myserver.com/ollama/api/chat');
  });

  it('ignores OLLAMA_HOST in cloud config', () => {
    const config = buildConfig('cloud', 'devstral-2', 'sk-test', {
      OLLAMA_HOST: 'localhost:8080',
    });
    expect(config.ollamaUrl).toBe(CLOUD_OLLAMA_URL);
  });
});

describe('buildOllamaTagsUrl', () => {
  it('replaces /api/chat with /api/tags', () => {
    expect(buildOllamaTagsUrl(`http://localhost:11434${OLLAMA_CHAT_PATH}`)).toBe(
      `http://localhost:11434${OLLAMA_TAGS_PATH}`,
    );
  });

  it('works with a custom host and port', () => {
    expect(buildOllamaTagsUrl(`http://localhost:8080${OLLAMA_CHAT_PATH}`)).toBe(
      `http://localhost:8080${OLLAMA_TAGS_PATH}`,
    );
  });

  it('works with a remote host', () => {
    expect(buildOllamaTagsUrl(`http://192.168.1.5:11434${OLLAMA_CHAT_PATH}`)).toBe(
      `http://192.168.1.5:11434${OLLAMA_TAGS_PATH}`,
    );
  });

  it('works with a custom path prefix', () => {
    expect(buildOllamaTagsUrl('http://myserver.com/ollama/api/chat')).toBe(
      'http://myserver.com/ollama/api/tags',
    );
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

describe('DEFAULT_CLOUD_MODEL', () => {
  it('is defined', () => {
    expect(DEFAULT_CLOUD_MODEL).toBe('devstral-small-2:24b');
  });
});
