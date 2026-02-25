import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as readline from 'readline';
import { promptUser, editMessage, selectFromList, promptInput, confirm } from './tui.js';

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

describe('promptUser (TTY mode)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let resumeSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let setRawModeMock: ReturnType<typeof vi.fn>;
  let originalIsTTY: boolean | undefined;
  let originalSetRawMode: typeof process.stdin.setRawMode;

  beforeEach(() => {
    vi.resetAllMocks();
    originalIsTTY = process.stdin.isTTY;
    originalSetRawMode = process.stdin.setRawMode;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    setRawModeMock = vi.fn().mockReturnValue(process.stdin);
    process.stdin.setRawMode = setRawModeMock as unknown as typeof process.stdin.setRawMode;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    resumeSpy = vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
    pauseSpy = vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.setRawMode = originalSetRawMode;
    exitSpy.mockRestore();
    logSpy.mockRestore();
    writeSpy.mockRestore();
    resumeSpy.mockRestore();
    pauseSpy.mockRestore();
    process.stdin.removeAllListeners('keypress');
  });

  it('calls setRawMode(true) on entry and setRawMode(false) on cleanup', async () => {
    const promise = promptUser('feat: tty test');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    await promise;
    expect(setRawModeMock).toHaveBeenCalledWith(true);
    expect(setRawModeMock).toHaveBeenCalledWith(false);
  });

  it("resolves 'accept' in TTY mode", async () => {
    const promise = promptUser('feat: tty test');
    process.stdin.emit('keypress', 'a', { name: 'a' });
    expect(await promise).toBe('accept');
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

  it('ignores non-escape key events', async () => {
    mockRl.question.mockImplementation((_: string, cb: (a: string) => void) => {
      // resolve after the ignored keypress
      setImmediate(() => cb('fixed: message'));
    });
    const promise = editMessage('original');
    process.stdin.emit('keypress', 'x', { name: 'x' });
    expect(await promise).toBe('fixed: message');
  });
});

describe('selectFromList (non-TTY)', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    writeSpy.mockRestore();
  });

  it('returns first item value without interactive prompt', async () => {
    const items = [
      { label: 'Local', value: 'local' },
      { label: 'Cloud', value: 'cloud' },
    ];
    expect(await selectFromList('Provider:', items)).toBe('local');
  });

  it('writes question and first item label to stdout', async () => {
    const items = [{ label: 'Local', value: 'local' }];
    await selectFromList('Provider:', items);
    expect(writeSpy).toHaveBeenCalledWith('Provider: Local\n');
  });
});

describe('selectFromList (TTY)', () => {
  let originalIsTTY: boolean | undefined;
  let originalSetRawMode: typeof process.stdin.setRawMode;
  let setRawModeMock: ReturnType<typeof vi.fn>;
  let resumeSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  const items = [
    { label: 'Local', value: 'local' as const, hint: 'private' },
    { label: 'Cloud', value: 'cloud' as const },
    { label: 'Anthropic', value: 'anthropic' as const },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    originalIsTTY = process.stdin.isTTY;
    originalSetRawMode = process.stdin.setRawMode;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    setRawModeMock = vi.fn().mockReturnValue(process.stdin);
    process.stdin.setRawMode = setRawModeMock as unknown as typeof process.stdin.setRawMode;
    resumeSpy = vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
    pauseSpy = vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.setRawMode = originalSetRawMode;
    resumeSpy.mockRestore();
    pauseSpy.mockRestore();
    writeSpy.mockRestore();
    exitSpy.mockRestore();
    process.stdin.removeAllListeners('keypress');
  });

  it('selects first item when Enter is pressed immediately', async () => {
    const promise = selectFromList('Provider:', items);
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe('local');
  });

  it('moves selection down and selects on Enter', async () => {
    const promise = selectFromList('Provider:', items);
    process.stdin.emit('keypress', null, { name: 'down' });
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe('cloud');
  });

  it('wraps up from first item to last', async () => {
    const promise = selectFromList('Provider:', items);
    process.stdin.emit('keypress', null, { name: 'up' });
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe('anthropic');
  });

  it('wraps down from last item to first', async () => {
    const promise = selectFromList('Provider:', items);
    process.stdin.emit('keypress', null, { name: 'down' });
    process.stdin.emit('keypress', null, { name: 'down' });
    process.stdin.emit('keypress', null, { name: 'down' });
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe('local');
  });

  it('calls process.exit(0) when Ctrl+C is pressed', () => {
    selectFromList('Provider:', items);
    expect(() => {
      process.stdin.emit('keypress', null, { name: 'c', ctrl: true });
    }).toThrow('process.exit(0)');
  });

  it('calls process.exit(0) when Escape is pressed', () => {
    selectFromList('Provider:', items);
    expect(() => {
      process.stdin.emit('keypress', null, { name: 'escape' });
    }).toThrow('process.exit(0)');
  });

  it('ignores null key events', async () => {
    const promise = selectFromList('Provider:', items);
    process.stdin.emit('keypress', null, null);
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe('local');
  });

  it('ignores unrecognized key presses', async () => {
    const promise = selectFromList('Provider:', items);
    process.stdin.emit('keypress', 'x', { name: 'x' });
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe('local');
  });

  it('removes keypress listener and restores stdin after selection', async () => {
    const before = process.stdin.listenerCount('keypress');
    const promise = selectFromList('Provider:', items);
    expect(process.stdin.listenerCount('keypress')).toBe(before + 1);
    process.stdin.emit('keypress', '\r', { name: 'return' });
    await promise;
    expect(process.stdin.listenerCount('keypress')).toBe(before);
    expect(setRawModeMock).toHaveBeenCalledWith(false);
    expect(pauseSpy).toHaveBeenCalled();
  });
});

describe('promptInput', () => {
  let mockRl: { question: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockRl = { question: vi.fn(), close: vi.fn() };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as unknown as readline.Interface);
  });

  it('returns trimmed answer', async () => {
    mockRl.question.mockImplementation((_: string, cb: (a: string) => void) => cb('  hello  '));
    expect(await promptInput('Name: ')).toBe('hello');
  });

  it('returns empty string when answer is blank', async () => {
    mockRl.question.mockImplementation((_: string, cb: (a: string) => void) => cb('   '));
    expect(await promptInput('Name: ')).toBe('');
  });

  it('closes the readline interface after answering', async () => {
    mockRl.question.mockImplementation((_: string, cb: (a: string) => void) => cb('hi'));
    await promptInput('Name: ');
    expect(mockRl.close).toHaveBeenCalled();
  });
});

describe('confirm', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let resumeSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    resumeSpy = vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
    pauseSpy = vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    writeSpy.mockRestore();
    resumeSpy.mockRestore();
    pauseSpy.mockRestore();
    process.stdin.removeAllListeners('keypress');
  });

  it("returns true when 'y' is pressed", async () => {
    const promise = confirm('Delete?');
    process.stdin.emit('keypress', 'y', { name: 'y' });
    expect(await promise).toBe(true);
  });

  it("returns true when 'Y' is pressed (case-insensitive)", async () => {
    const promise = confirm('Delete?');
    process.stdin.emit('keypress', 'Y', { name: 'y' });
    expect(await promise).toBe(true);
  });

  it("returns false when 'n' is pressed", async () => {
    const promise = confirm('Delete?');
    process.stdin.emit('keypress', 'n', { name: 'n' });
    expect(await promise).toBe(false);
  });

  it('returns false when Enter is pressed (default No)', async () => {
    const promise = confirm('Delete?');
    process.stdin.emit('keypress', '\r', { name: 'return' });
    expect(await promise).toBe(false);
  });

  it('writes the question with [y/N] to stdout', async () => {
    const promise = confirm('Continue?');
    process.stdin.emit('keypress', 'n', { name: 'n' });
    await promise;
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Continue?'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[y/N]'));
  });

  it('calls process.exit(0) when Escape is pressed', () => {
    confirm('Delete?');
    expect(() => {
      process.stdin.emit('keypress', '\u001b', { name: 'escape' });
    }).toThrow('process.exit(0)');
  });

  it('calls process.exit(0) when Ctrl+C is pressed', () => {
    confirm('Delete?');
    expect(() => {
      process.stdin.emit('keypress', '\u0003', { name: 'c', ctrl: true });
    }).toThrow('process.exit(0)');
  });
});
