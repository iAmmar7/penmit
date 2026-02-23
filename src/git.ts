import { spawnSync } from 'child_process';
import type { GitSpawner, SpawnResult } from './types.js';
import { GitError } from './errors.js';

function makeSpawner(extraOpts: Record<string, unknown> = {}): GitSpawner {
  return (cmd: string, args: string[]): SpawnResult => {
    const result = spawnSync(cmd, args, { encoding: 'utf8', ...extraOpts });
    return {
      stdout: (result.stdout as string | null) ?? '',
      error: result.error,
      status: result.status,
    };
  };
}

const diffSpawner: GitSpawner = makeSpawner();
const commitSpawner: GitSpawner = makeSpawner({ stdio: 'inherit' });

export function getStagedDiff(spawner: GitSpawner = diffSpawner): string {
  const result = spawner('git', ['diff', '--staged']);
  if (result.error) {
    throw new GitError(`Error running git diff: ${result.error.message}`);
  }
  return result.stdout;
}

export function runCommit(message: string, spawner: GitSpawner = commitSpawner): number {
  const result = spawner('git', ['commit', '-m', message]);
  if (result.error) {
    throw new GitError(`Failed to run git commit: ${result.error.message}`);
  }
  return result.status ?? 1;
}
