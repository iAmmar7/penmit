import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, colors, colorize } from './logger.js';

describe('log', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    delete process.env.DEBUG;
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
});

describe('colorize', () => {
  it('wraps text with color and reset', () => {
    expect(colorize(colors.cyan, 'test')).toBe(`${colors.cyan}test${colors.reset}`);
  });
});
