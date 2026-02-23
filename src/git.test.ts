import { describe, it, expect, vi } from 'vitest';
import { getStagedDiff, runCommit } from './git.js';
import { spawnSync } from 'child_process';
import type { GitSpawner } from './types.js';
import { GitError } from './errors.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawnSync: vi.fn() };
});

describe('getStagedDiff', () => {
  it('calls git diff --staged and returns stdout', () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const spawner: GitSpawner = (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: 'diff --git a/foo.ts b/foo.ts\n+hello', status: 0 };
    };

    const result = getStagedDiff(spawner);
    expect(result).toBe('diff --git a/foo.ts b/foo.ts\n+hello');
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('git');
    expect(calls[0].args).toEqual(['diff', '--staged']);
  });

  it('throws GitError when spawning fails', () => {
    const spawner: GitSpawner = () => ({
      stdout: '',
      error: new Error('git not found'),
      status: null,
    });
    expect(() => getStagedDiff(spawner)).toThrow(GitError);
    expect(() => getStagedDiff(spawner)).toThrow('git not found');
  });
});

describe('runCommit', () => {
  it('calls git commit -m <message> and returns exit status', () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const spawner: GitSpawner = (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: '', status: 0 };
    };

    const status = runCommit('feat: add feature', spawner);
    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('git');
    expect(calls[0].args).toEqual(['commit', '-m', 'feat: add feature']);
  });

  it('returns non-zero status when git commit fails', () => {
    const spawner: GitSpawner = () => ({ stdout: '', status: 1 });
    expect(runCommit('fix: something', spawner)).toBe(1);
  });

  it('returns 1 when status is null', () => {
    const spawner: GitSpawner = () => ({ stdout: '', status: null });
    expect(runCommit('chore: update', spawner)).toBe(1);
  });

  it('throws GitError when spawning fails', () => {
    const spawner: GitSpawner = () => ({
      stdout: '',
      error: new Error('git not found'),
      status: null,
    });
    expect(() => runCommit('feat: test', spawner)).toThrow(GitError);
  });

  it('preserves the commit message exactly, including special characters', () => {
    const captured: string[][] = [];
    const spawner: GitSpawner = (_, args) => {
      captured.push([...args]);
      return { stdout: '', status: 0 };
    };
    runCommit('fix: handle "quoted" values & special chars', spawner);
    expect(captured[0][2]).toBe('fix: handle "quoted" values & special chars');
  });
});

describe('default spawner', () => {
  it('getStagedDiff passes correct args to spawnSync and returns stdout', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      stdout: 'diff --git a/foo.ts b/foo.ts\n+hello',
      status: 0,
    } as unknown as ReturnType<typeof spawnSync>);

    const result = getStagedDiff();
    expect(result).toBe('diff --git a/foo.ts b/foo.ts\n+hello');
    expect(spawnSync).toHaveBeenCalledWith('git', ['diff', '--staged'], { encoding: 'utf8' });
  });

  it('getStagedDiff returns empty string when spawnSync stdout is null', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      stdout: null,
      status: 0,
    } as unknown as ReturnType<typeof spawnSync>);

    const result = getStagedDiff();
    expect(result).toBe('');
  });
});
