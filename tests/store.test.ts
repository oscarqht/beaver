import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  saveTask,
  readState,
  saveTerminal,
  deleteTaskAndTerminals,
  rememberRecentRepoPath,
} from '../lib/store';
import type { TaskRecord, TerminalRecord } from '../lib/types';

test('store persists tasks and terminals atomically', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-store-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const task: TaskRecord = {
    id: 'task-1',
    sourcePath: '/tmp/repo',
    workspacePath: '/tmp/repo',
    mode: 'local',
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    selectedBranch: 'main',
    worktreeBranch: null,
    status: 'active',
    ownerClientId: 'client-1',
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const terminal: TerminalRecord = {
    id: 'term-1',
    taskId: task.id,
    role: 'main',
    title: 'Main',
    tmuxSessionName: 'bever-task-1-main',
    closable: false,
    createdAt: new Date().toISOString(),
  };

  await saveTask(task);
  await saveTerminal(terminal);

  const state = await readState();
  assert.deepEqual(state.tasks[task.id], task);
  assert.deepEqual(state.terminals[terminal.id], terminal);

  await deleteTaskAndTerminals(task.id);
  const emptyState = await readState();
  assert.equal(emptyState.tasks[task.id], undefined);
  assert.equal(emptyState.terminals[terminal.id], undefined);
});

test('store keeps recent repository paths deduplicated and capped at ten', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-store-recents-'));
  process.env.BEVER_HOME_DIR = tempHome;

  for (let index = 0; index < 12; index += 1) {
    await rememberRecentRepoPath(`/tmp/repo-${index}`);
  }
  await rememberRecentRepoPath('/tmp/repo-5');

  const state = await readState();
  assert.deepEqual(state.recentRepoPaths, [
    '/tmp/repo-5',
    '/tmp/repo-11',
    '/tmp/repo-10',
    '/tmp/repo-9',
    '/tmp/repo-8',
    '/tmp/repo-7',
    '/tmp/repo-6',
    '/tmp/repo-4',
    '/tmp/repo-3',
    '/tmp/repo-2',
  ]);
});

test('store serializes concurrent updates without dropping data', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-store-concurrent-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const taskOne: TaskRecord = {
    id: 'task-a',
    sourcePath: '/tmp/repo-a',
    workspacePath: '/tmp/repo-a',
    mode: 'local',
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    selectedBranch: 'main',
    worktreeBranch: null,
    status: 'active',
    ownerClientId: 'client-a',
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const taskTwo: TaskRecord = {
    ...taskOne,
    id: 'task-b',
    sourcePath: '/tmp/repo-b',
    workspacePath: '/tmp/repo-b',
    ownerClientId: 'client-b',
  };

  await Promise.all([
    saveTask(taskOne),
    saveTask(taskTwo),
    rememberRecentRepoPath('/tmp/repo-a'),
    rememberRecentRepoPath('/tmp/repo-b'),
  ]);

  const state = await readState();
  assert.deepEqual(state.tasks[taskOne.id], taskOne);
  assert.deepEqual(state.tasks[taskTwo.id], taskTwo);
  assert.deepEqual(state.recentRepoPaths, ['/tmp/repo-b', '/tmp/repo-a']);
});
