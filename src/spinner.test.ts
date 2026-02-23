import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSpinner } from './spinner.js';

describe('createSpinner (non-TTY)', () => {
  let output: string[];
  let originalWrite: typeof process.stdout.write;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    output = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    process.stdout.write = (chunk: string) => {
      output.push(chunk);
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('writes the loading text on start', () => {
    const spinner = createSpinner('Thinking');
    spinner.stop();
    expect(output.join('')).toContain('Thinking');
  });

  it('writes the final message on stop()', () => {
    const spinner = createSpinner('Working');
    spinner.stop('Done!');
    expect(output.join('')).toContain('Done!');
  });

  it('does not write final message when stop() called without argument', () => {
    const spinner = createSpinner('Working');
    output = [];
    spinner.stop();
    expect(output.join('')).toBe('');
  });
});

describe('createSpinner (TTY)', () => {
  let output: string[];
  let originalWrite: typeof process.stdout.write;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    output = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    process.stdout.write = ((chunk: string) => {
      output.push(chunk);
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.stdout.write = originalWrite;
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
  });

  it('writes spinner frame with text on each interval tick', () => {
    createSpinner('Loading');
    vi.advanceTimersByTime(80);
    expect(output.join('')).toContain('Loading');
  });

  it('stop() clears the current line', () => {
    const spinner = createSpinner('Loading');
    spinner.stop();
    expect(output.join('')).toContain('\r\x1b[K');
  });

  it('stop() with message writes the final message after clearing', () => {
    const spinner = createSpinner('Loading');
    spinner.stop('All done!');
    const joined = output.join('');
    expect(joined).toContain('\r\x1b[K');
    expect(joined).toContain('All done!');
  });

  it('stop() without message only clears the line', () => {
    const spinner = createSpinner('Loading');
    const beforeStop = output.length;
    spinner.stop();
    expect(output.slice(beforeStop).join('')).toBe('\r\x1b[K');
  });
});
