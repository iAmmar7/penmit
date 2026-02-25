import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as readline from 'readline';
import { promptUser, editMessage } from './tui.js';

vi.mock('readline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('readline')>();
  return {
    ...actual,
    emitKeypressEvents: vi.fn(),
    createInterface: vi.fn(),
  };
});

describe('promptUser', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let resumeSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    resumeSpy = vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
    pauseSpy = vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    writeSpy.mockRestore();
    resumeSpy.mockRestore();
    pauseSpy.mockRestore();
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.removeAllListeners('keypress');
  });

  it('prints the commit message to console', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    await promise;
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('feat: add login'));
  });

  it('writes the key prompt to stdout', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    await promise;
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Accept'));
  });

  it("resolves 'accept' when 'a' is pressed", async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    expect(await promise).toBe('accept');
  });

  it("resolves 'accept' when Enter is pressed", async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe('accept');
  });

  it("resolves 'regenerate' when 'r' is pressed", async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'r', { name: 'r' });
    expect(await promise).toBe('regenerate');
  });

  it("resolves 'edit' when 'e' is pressed", async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'e', { name: 'e' });
    expect(await promise).toBe('edit');
  });

  it('key matching is case-insensitive', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'A', { name: 'A' });
    expect(await promise).toBe('accept');
  });

  it('calls process.exit(0) when Escape is pressed', () => {
    promptUser('feat: add login');
    expect(() => {
      process.stdin.emit('keypress', '\u001b', { name: 'escape' });
    }).toThrow('process.exit(0)');
  });

  it('calls process.exit(0) when Ctrl+C is pressed', () => {
    promptUser('feat: add login');
    expect(() => {
      process.stdin.emit('keypress', '\u0003', { name: 'c', ctrl: true });
    }).toThrow('process.exit(0)');
  });

  it('ignores null key events', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'x', null);
    process.stdin.emit('keypress', 'a', { name: 'a' });
    expect(await promise).toBe('accept');
  });

  it('ignores unrecognized key presses', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'z', { name: 'z' });
    process.stdin.emit('keypress', '1', { name: '1' });
    process.stdin.emit('keypress', 'a', { name: 'a' });
    expect(await promise).toBe('accept');
  });

  it('calls stdin.resume on start', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    await promise;
    expect(resumeSpy).toHaveBeenCalled();
  });

  it('calls stdin.pause after key is handled', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    await promise;
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('calls readline.emitKeypressEvents on stdin', async () => {
    const promise = promptUser('feat: add login');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    await promise;
    expect(vi.mocked(readline.emitKeypressEvents)).toHaveBeenCalledWith(process.stdin);
  });

  it('removes the keypress listener after handling', async () => {
    const before = process.stdin.listenerCount('keypress');
    const promise = promptUser('feat: add login');
    expect(process.stdin.listenerCount('keypress')).toBe(before + 1);
    process.stdin.emit('keypress', 'a', { name: 'a' });
    await promise;
    expect(process.stdin.listenerCount('keypress')).toBe(before);
  });
});

describe('editMessage', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let mockRl: {
    question: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRl = {
      question: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as unknown as readline.Interface);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    process.stdin.removeAllListeners('keypress');
  });

  it('returns the edited message', async () => {
    mockRl.question.mockImplementation((_: string, cb: (answer: string) => void) => {
      cb('new commit message');
    });
    expect(await editMessage('original')).toBe('new commit message');
  });

  it('returns original when answer is empty', async () => {
    mockRl.question.mockImplementation((_: string, cb: (answer: string) => void) => {
      cb('');
    });
    expect(await editMessage('original')).toBe('original');
  });

  it('returns original when answer is only whitespace', async () => {
    mockRl.question.mockImplementation((_: string, cb: (answer: string) => void) => {
      cb('   ');
    });
    expect(await editMessage('original')).toBe('original');
  });

  it('trims the edited message', async () => {
    mockRl.question.mockImplementation((_: string, cb: (answer: string) => void) => {
      cb('  fix: trimmed  ');
    });
    expect(await editMessage('original')).toBe('fix: trimmed');
  });

  it('pre-fills input with the original message', async () => {
    mockRl.question.mockImplementation((_: string, cb: (answer: string) => void) => {
      cb('original');
    });
    await editMessage('original');
    expect(mockRl.write).toHaveBeenCalledWith('original');
  });

  it('closes the readline interface after answering', async () => {
    mockRl.question.mockImplementation((_: string, cb: (answer: string) => void) => {
      cb('done');
    });
    await editMessage('original');
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('calls process.exit(0) when Escape is pressed', () => {
    mockRl.question.mockImplementation(() => {}); // never resolves
    editMessage('original');
    expect(() => {
      process.stdin.emit('keypress', '\u001b', { name: 'escape' });
    }).toThrow('process.exit(0)');
  });
});
