import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expandUserPath, ensureDirectory } from './fs-utils';
import type { BranchOption } from './types';

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd?: string): Promise<string> {
  const result = await execFileAsync('git', args, cwd ? { cwd, encoding: 'utf8' } : { encoding: 'utf8' });
  return result.stdout.trim();
}

export async function resolveGitRepositoryPath(inputPath: string): Promise<string> {
  const resolved = expandUserPath(inputPath);
  if (!resolved) {
    throw new Error('Repository path is required.');
  }

  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error('Repository path does not exist.');
  }

  const repoRoot = await runGit(['-C', resolved, 'rev-parse', '--show-toplevel']).catch(() => null);
  if (!repoRoot) {
    throw new Error('Selected path is not a Git repository.');
  }

  return repoRoot;
}

export async function listLocalBranches(repoPath: string): Promise<{
  branches: BranchOption[];
  currentBranch: string;
}> {
  const currentBranch = await runGit(['-C', repoPath, 'branch', '--show-current']);
  const branchOutput = await runGit(['-C', repoPath, 'for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  const branches = branchOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      current: name === currentBranch,
    }));

  return {
    branches,
    currentBranch,
  };
}

export async function checkoutBranch(repoPath: string, branchName: string): Promise<void> {
  const currentBranch = await runGit(['-C', repoPath, 'branch', '--show-current']);
  if (currentBranch === branchName) return;

  const dirty = await runGit(['-C', repoPath, 'status', '--porcelain']);
  if (dirty) {
    throw new Error('Cannot switch branches in local mode because the repository has uncommitted changes.');
  }

  await runGit(['-C', repoPath, 'checkout', branchName]);
}

export async function createWorktree(repoPath: string, taskId: string, baseBranch: string): Promise<{
  workspacePath: string;
  worktreeBranch: string;
}> {
  const repoName = path.basename(repoPath);
  const parentDir = path.dirname(repoPath);
  const worktreeRoot = path.join(parentDir, '.bever', repoName);
  const workspacePath = path.join(worktreeRoot, taskId);
  const worktreeBranch = `bever/${taskId}`;

  await ensureDirectory(worktreeRoot);
  await runGit(['-C', repoPath, 'worktree', 'add', '-b', worktreeBranch, workspacePath, baseBranch]);

  return { workspacePath, worktreeBranch };
}

export async function removeWorktree(
  repoPath: string,
  workspacePath: string,
  worktreeBranch: string | null,
): Promise<void> {
  await runGit(['-C', repoPath, 'worktree', 'remove', '--force', workspacePath]).catch(() => undefined);
  if (worktreeBranch) {
    await runGit(['-C', repoPath, 'branch', '-D', worktreeBranch]).catch(() => undefined);
  }
  await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => undefined);
}
