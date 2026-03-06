import { describe, it, expect } from 'vitest';
import { getUserPrompt, SYSTEM_PROMPT } from './prompts.js';

describe('getUserPrompt', () => {
  it('includes the diff in the prompt', () => {
    const prompt = getUserPrompt('some diff content');
    expect(prompt).toContain('some diff content');
  });

  it('defaults to 72 characters in the length rule', () => {
    const prompt = getUserPrompt('diff');
    expect(prompt).toContain('72 characters or fewer');
  });

  it('uses custom maxLength in the length rule', () => {
    const prompt = getUserPrompt('diff', 50);
    expect(prompt).toContain('50 characters or fewer');
  });
});

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(SYSTEM_PROMPT).toBeTruthy();
    expect(typeof SYSTEM_PROMPT).toBe('string');
  });
});
