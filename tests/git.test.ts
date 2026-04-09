import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkoutBranch, createWorktree, listLocalBranches, removeWorktree, resolveGitRepositoryPath } from '../lib/git';

const execFileAsync = promisify(execFile);

async function createRepo() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-git-'));
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Bever Test'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'bever@example.com'], { cwd: repoPath });
  await fs.writeFile(path.join(repoPath, 'README.md'), '# test\n', 'utf8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repoPath });
  await execFileAsync('git', ['branch', 'feature'], { cwd: repoPath });
  return repoPath;
}

test('lists branches and resolves repository root', async () => {
  const repoPath = await createRepo();
  const nested = path.join(repoPath, 'subdir');
  await fs.mkdir(nested);
  const realRepoPath = await fs.realpath(repoPath);

  const resolved = await resolveGitRepositoryPath(nested);
  const branchState = await listLocalBranches(repoPath);

  assert.equal(resolved, realRepoPath);
  assert.equal(branchState.currentBranch, 'main');
  assert.deepEqual(
    branchState.branches.map((branch) => branch.name).sort(),
    ['feature', 'main'],
  );
});

test('local checkout refuses dirty repositories', async () => {
  const repoPath = await createRepo();
  await fs.writeFile(path.join(repoPath, 'README.md'), 'dirty\n', 'utf8');
  await assert.rejects(
    () => checkoutBranch(repoPath, 'feature'),
    /uncommitted changes/i,
  );
});

test('local checkout retries transient index.lock failures', async () => {
  const repoPath = await createRepo();
  const lockPath = path.join(repoPath, '.git', 'index.lock');
  await fs.writeFile(lockPath, '', 'utf8');

  setTimeout(() => {
    void fs.rm(lockPath, { force: true });
  }, 150);

  await checkoutBranch(repoPath, 'feature');
  const currentBranch = await execFileAsync('git', ['branch', '--show-current'], { cwd: repoPath });
  assert.equal(currentBranch.stdout.trim(), 'feature');
});

test('creates and removes worktrees', async () => {
  const repoPath = await createRepo();
  const worktree = await createWorktree(repoPath, 'task-123', 'main');
  const stat = await fs.stat(worktree.workspacePath);
  assert.equal(stat.isDirectory(), true);

  await removeWorktree(repoPath, worktree.workspacePath, worktree.worktreeBranch);
  const exists = await fs.stat(worktree.workspacePath).then(() => true).catch(() => false);
  assert.equal(exists, false);
});
