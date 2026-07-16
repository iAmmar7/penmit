import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, colors, colorize } from './logger.js';

describe('log', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.FORCE_COLOR = '1';
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    delete process.env.DEBUG;
    delete process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
  });

  it('info writes to stdout via console.log', () => {
    log.info('hello', 'world');
    expect(logSpy).toHaveBeenCalledWith('hello', 'world');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('warn writes to stderr with yellow color', () => {
    log.warn('caution');
    expect(errorSpy).toHaveBeenCalledWith(`${colors.yellow}caution${colors.reset}`);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('error writes to stderr with red color', () => {
    log.error('failure');
    expect(errorSpy).toHaveBeenCalledWith(`${colors.red}failure${colors.reset}`);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('debug is silent by default', () => {
    log.debug('hidden');
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('debug writes to stderr with gray color when DEBUG=1', () => {
    process.env.DEBUG = '1';
    log.debug('visible');
    expect(errorSpy).toHaveBeenCalledWith(`${colors.gray}visible${colors.reset}`);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warn and error emit plain text when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    log.warn('caution');
    log.error('failure');
    expect(errorSpy).toHaveBeenNthCalledWith(1, 'caution');
    expect(errorSpy).toHaveBeenNthCalledWith(2, 'failure');
  });

  it('warn emits plain text when stderr is not a TTY', () => {
    delete process.env.FORCE_COLOR;
    const isTTY = process.stderr.isTTY;
    process.stderr.isTTY = false;
    try {
      log.warn('caution');
      expect(errorSpy).toHaveBeenCalledWith('caution');
    } finally {
      process.stderr.isTTY = isTTY;
    }
  });
});

describe('colorize', () => {
  afterEach(() => {
    delete process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
  });

  it('wraps text with color and reset when color is enabled', () => {
    process.env.FORCE_COLOR = '1';
    expect(colorize(colors.cyan, 'test')).toBe(`${colors.cyan}test${colors.reset}`);
  });

  it('returns plain text when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    expect(colorize(colors.cyan, 'test')).toBe('test');
  });

  it('returns plain text when stdout is not a TTY', () => {
    const isTTY = process.stdout.isTTY;
    process.stdout.isTTY = false;
    try {
      expect(colorize(colors.cyan, 'test')).toBe('test');
    } finally {
      process.stdout.isTTY = isTTY;
    }
  });

  it('NO_COLOR wins over FORCE_COLOR', () => {
    process.env.NO_COLOR = '1';
    process.env.FORCE_COLOR = '1';
    expect(colorize(colors.cyan, 'test')).toBe('test');
  });
});
