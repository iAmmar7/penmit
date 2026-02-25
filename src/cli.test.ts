import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import * as configModule from './config.js';
import * as gitModule from './git.js';
import * as ollamaModule from './ollama.js';
import * as anthropicModule from './anthropic.js';
import * as promptModule from './tui.js';
import * as spinnerModule from './spinner.js';
import { readFileSync } from 'fs';
import { GitError, OllamaError, AnthropicError } from './errors.js';

vi.mock('./config.js');
vi.mock('./git.js');
vi.mock('./ollama.js');
vi.mock('./anthropic.js');
vi.mock('./tui.js');
vi.mock('./spinner.js');
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const LOCAL_URL = 'http://localhost:11434/api/chat';
const TAGS_URL = 'http://localhost:11434/api/tags';

describe('run', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let actualReadFileSync: typeof readFileSync;

  beforeAll(async () => {
    const fs = await vi.importActual<typeof import('fs')>('fs');
    actualReadFileSync = fs.readFileSync;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(readFileSync).mockImplementation(actualReadFileSync as typeof readFileSync);

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default: parsed args with no flags
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: false,
      setup: false,
    });

    // Default: saved config has ollama/local + llama3.2 (no interactive needed)
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'llama3.2',
    });
    vi.mocked(configModule.writeUserConfig).mockImplementation(() => {});

    vi.mocked(ollamaModule.buildOllamaChatUrl).mockReturnValue(LOCAL_URL);
    vi.mocked(ollamaModule.buildOllamaTagsUrl).mockReturnValue(TAGS_URL);
    // Dynamic mock: return a config using the provider/ollamaMode/model args passed in
    vi.mocked(configModule.buildConfig).mockImplementation(({ provider, ollamaMode, model }) => ({
      provider,
      ollamaMode: provider === 'ollama' ? ollamaMode : undefined,
      url:
        provider === 'ollama'
          ? ollamaMode === 'cloud'
            ? 'https://ollama.com/api/chat'
            : LOCAL_URL
          : '',
      model: model as string,
      debug: false,
    }));

    vi.mocked(promptModule.promptInput).mockResolvedValue('');

    vi.mocked(gitModule.getStagedDiff).mockReturnValue('diff --git a/foo.ts b/foo.ts\n+hello');
    vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2']);
    vi.mocked(ollamaModule.generateCommitMessage).mockResolvedValue('feat: add login');
    vi.mocked(anthropicModule.generateCommitMessage).mockResolvedValue('feat: add login');
    vi.mocked(promptModule.promptUser).mockResolvedValue('accept');
    vi.mocked(promptModule.selectFromList).mockResolvedValue('local');
    vi.mocked(gitModule.runCommit).mockReturnValue(0);
    vi.mocked(spinnerModule.createSpinner).mockReturnValue({ stop: vi.fn() });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  async function run(argv?: string[], env?: Record<string, string | undefined>) {
    const { run: runFn } = await import('./cli.js');
    return runFn(argv, env ?? {});
  }

  it('exits with code 1 when parseArgs throws an Error', async () => {
    vi.mocked(configModule.parseArgs).mockImplementation(() => {
      throw new Error('Unknown option: --bad');
    });
    await expect(run(['--bad'])).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Error: Unknown option: --bad');
  });

  it('exits with code 1 when parseArgs throws a non-Error', async () => {
    vi.mocked(configModule.parseArgs).mockImplementation(() => {
      throw 'plain string thrown';
    });
    await expect(run(['--bad'])).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Error: plain string thrown');
  });

  it('prints help text and returns when --help is passed', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: true,
      version: false,
      setup: false,
    });
    await run(['--help']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('aicommit'));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints version from package.json when --version is passed', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: true,
      setup: false,
    });
    await run(['--version']);
    expect(logSpy).toHaveBeenCalledWith(expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints 0.0.0 when package.json cannot be read', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: true,
      setup: false,
    });
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    await run(['--version']);
    expect(logSpy).toHaveBeenCalledWith('0.0.0');
  });

  it('shows interactive picker on first run (no saved config)', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({});
    vi.mocked(promptModule.selectFromList)
      .mockResolvedValueOnce('ollama-local') // provider picker
      .mockResolvedValueOnce('llama3.2'); // model picker
    vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);

    await run();

    expect(promptModule.selectFromList).toHaveBeenCalledTimes(2);
    expect(configModule.writeUserConfig).toHaveBeenCalledWith({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'llama3.2',
    });
  });

  it('--local flag uses local provider without picker and does not save config', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: false,
      setup: false,
      provider: 'ollama',
      ollamaMode: 'local',
    });
    vi.mocked(configModule.readUserConfig).mockReturnValue({});
    vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['mistral']);

    await run(['--local']);

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
    expect(configModule.writeUserConfig).not.toHaveBeenCalled();
  });

  it('--cloud flag uses cloud provider without picker', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: false,
      setup: false,
      provider: 'ollama',
      ollamaMode: 'cloud',
    });
    vi.mocked(configModule.readUserConfig).mockReturnValue({});
    vi.mocked(configModule.buildConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'cloud',
      url: 'https://ollama.com/api/chat',
      model: 'devstral-2',
      apiKey: 'sk-test',
      debug: false,
    });

    await run(['--cloud'], { OLLAMA_API_KEY: 'sk-test' });

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
  });

  it('OLLAMA_API_KEY env var triggers cloud provider without picker', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({});
    vi.mocked(promptModule.promptInput).mockResolvedValue('devstral-small-2:24b');
    vi.mocked(configModule.buildConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'cloud',
      url: 'https://ollama.com/api/chat',
      model: 'devstral-small-2:24b',
      apiKey: 'sk-test',
      debug: false,
    });

    await run([], { OLLAMA_API_KEY: 'sk-test' });

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
  });

  it('--setup forces interactive picker even when saved config exists', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: false,
      setup: true,
    });
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'llama3.2',
    });
    vi.mocked(promptModule.selectFromList)
      .mockResolvedValueOnce('ollama-local') // provider picker
      .mockResolvedValueOnce('mistral'); // model picker
    vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);

    await run(['--setup']);

    expect(promptModule.selectFromList).toHaveBeenCalledTimes(2);
    expect(configModule.writeUserConfig).toHaveBeenCalledWith({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'mistral',
    });
  });

  it('uses saved local model silently when it is still installed', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'mistral',
    });
    vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);

    await run();

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
    expect(ollamaModule.generateCommitMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: 'mistral' }),
    );
  });

  it('shows model picker when saved model is no longer installed', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'removed-model',
    });
    vi.mocked(ollamaModule.getLocalModels).mockResolvedValue(['llama3.2', 'mistral']);
    vi.mocked(promptModule.selectFromList).mockResolvedValueOnce('mistral');

    await run();

    expect(promptModule.selectFromList).toHaveBeenCalledTimes(1);
    expect(configModule.writeUserConfig).toHaveBeenCalledWith({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'mistral',
    });
  });

  it('--model flag overrides saved model for this run only', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: false,
      setup: false,
      model: 'codellama',
    });
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
      model: 'llama3.2',
    });

    await run(['--model', 'codellama']);

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
    expect(configModule.buildConfig).toHaveBeenCalledWith(
      { provider: 'ollama', ollamaMode: 'local', model: 'codellama', apiKey: undefined },
      expect.any(Object),
    );
    expect(configModule.writeUserConfig).not.toHaveBeenCalled();
  });

  it('prompts for cloud model and uses default when empty input', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({});
    vi.mocked(promptModule.promptInput).mockResolvedValue('');
    vi.mocked(configModule.buildConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'cloud',
      url: 'https://ollama.com/api/chat',
      model: 'devstral-small-2:24b',
      apiKey: 'sk-test',
      debug: false,
    });

    await run([], { OLLAMA_API_KEY: 'sk-test' });

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
    expect(configModule.buildConfig).toHaveBeenCalledWith(
      { provider: 'ollama', ollamaMode: 'cloud', model: 'devstral-small-2:24b', apiKey: 'sk-test' },
      expect.any(Object),
    );
  });

  it('exits with code 1 when no local models are installed', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
      model: undefined,
    });
    vi.mocked(ollamaModule.getLocalModels).mockResolvedValue([]);

    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No local models found'));
  });

  it('exits with code 1 when getLocalModels throws OllamaError', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
    });
    vi.mocked(ollamaModule.getLocalModels).mockRejectedValue(
      new OllamaError('Could not connect to Ollama'),
    );

    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Could not connect to Ollama');
  });

  it('exits with code 1 when getLocalModels throws a non-OllamaError', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'ollama',
      ollamaMode: 'local',
    });
    vi.mocked(ollamaModule.getLocalModels).mockRejectedValue('raw error');

    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('raw error');
  });

  it('prints provider and model before generating', async () => {
    await run();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Local'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('llama3.2'));
  });

  it('exits with code 1 when getStagedDiff throws GitError', async () => {
    vi.mocked(gitModule.getStagedDiff).mockImplementation(() => {
      throw new GitError('git not found');
    });
    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('git not found');
  });

  it('exits with code 1 when getStagedDiff throws a non-GitError', async () => {
    vi.mocked(gitModule.getStagedDiff).mockImplementation(() => {
      throw 'spawn failure';
    });
    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('spawn failure');
  });

  it('exits with code 1 when diff is empty', async () => {
    vi.mocked(gitModule.getStagedDiff).mockReturnValue('   ');
    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No staged changes'));
  });

  it('exits with code 1 when generateCommitMessage throws OllamaError', async () => {
    vi.mocked(ollamaModule.generateCommitMessage).mockRejectedValue(
      new OllamaError('Could not connect to Ollama'),
    );
    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Could not connect to Ollama');
  });

  it('exits with code 1 when generateCommitMessage throws a non-OllamaError', async () => {
    vi.mocked(ollamaModule.generateCommitMessage).mockRejectedValue('raw string error');
    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('raw string error');
  });

  it('runs commit and returns when user accepts the message', async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue('accept');
    await run();
    expect(gitModule.runCommit).toHaveBeenCalledWith('feat: add login');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits with the commit status code when git commit fails after accept', async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue('accept');
    vi.mocked(gitModule.runCommit).mockReturnValue(128);
    await expect(run()).rejects.toThrow('process.exit(128)');
  });

  it('regenerates and then accepts on second prompt', async () => {
    vi.mocked(ollamaModule.generateCommitMessage)
      .mockResolvedValueOnce('feat: initial')
      .mockResolvedValueOnce('feat: regenerated');
    vi.mocked(promptModule.promptUser)
      .mockResolvedValueOnce('regenerate')
      .mockResolvedValueOnce('accept');
    vi.mocked(gitModule.runCommit).mockReturnValue(0);

    await run();

    expect(ollamaModule.generateCommitMessage).toHaveBeenCalledTimes(2);
    expect(gitModule.runCommit).toHaveBeenCalledWith('feat: regenerated');
  });

  it('exits with code 1 when regeneration throws OllamaError', async () => {
    vi.mocked(ollamaModule.generateCommitMessage)
      .mockResolvedValueOnce('feat: initial')
      .mockRejectedValueOnce(new OllamaError('offline'));
    vi.mocked(promptModule.promptUser).mockResolvedValue('regenerate');

    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('offline');
  });

  it('exits with code 1 when regeneration throws a non-OllamaError', async () => {
    vi.mocked(ollamaModule.generateCommitMessage)
      .mockResolvedValueOnce('feat: initial')
      .mockRejectedValueOnce('plain string failure');
    vi.mocked(promptModule.promptUser).mockResolvedValue('regenerate');

    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('plain string failure');
  });

  it('runs commit with edited message when user chooses edit', async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue('edit');
    vi.mocked(promptModule.editMessage).mockResolvedValue('fix: edited message');
    vi.mocked(gitModule.runCommit).mockReturnValue(0);

    await run();

    expect(promptModule.editMessage).toHaveBeenCalledWith('feat: add login');
    expect(gitModule.runCommit).toHaveBeenCalledWith('fix: edited message');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits with commit status code when git commit fails after edit', async () => {
    vi.mocked(promptModule.promptUser).mockResolvedValue('edit');
    vi.mocked(promptModule.editMessage).mockResolvedValue('fix: edited');
    vi.mocked(gitModule.runCommit).mockReturnValue(1);

    await expect(run()).rejects.toThrow('process.exit(1)');
  });

  // Anthropic provider
  it('ANTHROPIC_API_KEY env var triggers anthropic provider without picker', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({});
    vi.mocked(promptModule.selectFromList).mockResolvedValueOnce('claude-sonnet-4-6');

    await run([], { ANTHROPIC_API_KEY: 'sk-ant-test' });

    expect(promptModule.selectFromList).toHaveBeenCalledTimes(1); // model picker only
    expect(configModule.buildConfig).toHaveBeenCalledWith(
      {
        provider: 'anthropic',
        ollamaMode: undefined,
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      },
      expect.any(Object),
    );
  });

  it('--anthropic flag uses anthropic provider without provider picker', async () => {
    vi.mocked(configModule.parseArgs).mockReturnValue({
      help: false,
      version: false,
      setup: false,
      provider: 'anthropic',
    });
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-saved',
    });

    await run(['--anthropic'], { ANTHROPIC_API_KEY: 'sk-ant-test' });

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
    expect(configModule.buildConfig).toHaveBeenCalledWith(
      {
        provider: 'anthropic',
        ollamaMode: undefined,
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      },
      expect.any(Object),
    );
  });

  it('uses saved anthropic model silently', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      apiKey: 'sk-ant-saved',
    });

    await run([], {});

    expect(promptModule.selectFromList).not.toHaveBeenCalled();
    expect(anthropicModule.generateCommitMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    );
  });

  it('exits with code 1 when generateCommitMessage (anthropic) throws AnthropicError', async () => {
    vi.mocked(configModule.readUserConfig).mockReturnValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-test',
    });
    vi.mocked(anthropicModule.generateCommitMessage).mockRejectedValue(
      new AnthropicError('Invalid API key'),
    );

    await expect(run([], {})).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Invalid API key');
  });
});
