import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { saveTask, readState, saveTerminal, deleteTaskAndTerminals } from '../lib/store';
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
