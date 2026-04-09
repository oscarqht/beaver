import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  bootstrapTask,
  deleteAllTasks,
  deleteTask,
  listTasks,
  releaseTaskOwnership,
  renameTerminal,
  splitMainTerminalDuplicates,
  sweepStaleTasks,
} from '../lib/task-service';
import { formatPathsForTerminalInput } from '../lib/shell-path-format';
import { readState, saveTask, saveTerminal } from '../lib/store';
import type { TaskRecord, TerminalRecord } from '../lib/types';

test('splitMainTerminalDuplicates keeps the earliest main terminal and preserves shell tabs', () => {
  const terminals: TerminalRecord[] = [
    {
      id: 'main-1',
      taskId: 'task-1',
      role: 'main',
      title: 'Codex CLI main',
      tmuxSessionName: 'main-1',
      closable: false,
      createdAt: '2026-04-09T01:00:00.000Z',
    },
    {
      id: 'shell-1',
      taskId: 'task-1',
      role: 'shell',
      title: 'Shell 1',
      tmuxSessionName: 'shell-1',
      closable: true,
      createdAt: '2026-04-09T01:00:01.000Z',
    },
    {
      id: 'main-2',
      taskId: 'task-1',
      role: 'main',
      title: 'Codex CLI main',
      tmuxSessionName: 'main-2',
      closable: false,
      createdAt: '2026-04-09T01:00:02.000Z',
    },
  ];

  const result = splitMainTerminalDuplicates(terminals);

  assert.equal(result.primaryMainTerminal?.id, 'main-1');
  assert.deepEqual(
    result.duplicateMainTerminals.map((terminal) => terminal.id),
    ['main-2'],
  );
  assert.deepEqual(
    result.normalizedTerminals.map((terminal) => terminal.id),
    ['main-1', 'shell-1'],
  );
});

test('renameTerminal trims leading and trailing spacing before persisting the title', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-rename-terminal-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const task: TaskRecord = {
    id: 'task-rename',
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
    id: 'term-rename',
    taskId: task.id,
    role: 'shell',
    title: 'Old title',
    tmuxSessionName: 'term-rename',
    closable: true,
    createdAt: new Date().toISOString(),
  };

  await saveTask(task);
  await saveTerminal(terminal);

  const renamed = await renameTerminal(task.id, terminal.id, 'client-1', '  New title  ');
  const state = await readState();

  assert.equal(renamed.title, 'New title');
  assert.equal(state.terminals[terminal.id]?.title, 'New title');
});

test('formatPathsForTerminalInput shell-quotes each selected path', () => {
  const formatted = formatPathsForTerminalInput(['/tmp/alpha.txt', "/tmp/O'Reilly notes.md"]);
  assert.equal(formatted, "'/tmp/alpha.txt' '/tmp/O'\\''Reilly notes.md'");
});

test('listTasks sorts newest first and deleteTask removes a pending task', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-list-tasks-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const olderTask: TaskRecord = {
    id: 'task-older',
    sourcePath: '/tmp/repo-older',
    workspacePath: '',
    mode: 'local',
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    selectedBranch: 'main',
    worktreeBranch: null,
    status: 'pending',
    ownerClientId: null,
    lastHeartbeatAt: null,
    createdAt: '2026-04-09T01:00:00.000Z',
  };

  const newerTask: TaskRecord = {
    ...olderTask,
    id: 'task-newer',
    sourcePath: '/tmp/repo-newer',
    createdAt: '2026-04-09T02:00:00.000Z',
  };

  await saveTask(olderTask);
  await saveTask(newerTask);

  const tasks = await listTasks();
  assert.deepEqual(tasks.map((task) => task.id), ['task-newer', 'task-older']);

  await deleteTask(newerTask.id);
  const state = await readState();

  assert.equal(state.tasks[newerTask.id], undefined);
  assert.equal(state.tasks[olderTask.id]?.id, olderTask.id);
});

test('deleteAllTasks removes every pending task', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-delete-all-tasks-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const firstTask: TaskRecord = {
    id: 'task-1',
    sourcePath: '/tmp/repo-1',
    workspacePath: '',
    mode: 'local',
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    selectedBranch: 'main',
    worktreeBranch: null,
    status: 'pending',
    ownerClientId: null,
    lastHeartbeatAt: null,
    createdAt: '2026-04-09T03:00:00.000Z',
  };

  const secondTask: TaskRecord = {
    ...firstTask,
    id: 'task-2',
    sourcePath: '/tmp/repo-2',
    createdAt: '2026-04-09T04:00:00.000Z',
  };

  await saveTask(firstTask);
  await saveTask(secondTask);

  const deletedTaskIds = await deleteAllTasks();
  const state = await readState();

  assert.deepEqual(deletedTaskIds, ['task-2', 'task-1']);
  assert.deepEqual(state.tasks, {});
});

test('sweepStaleTasks releases stale ownership without deleting the task', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-sweep-stale-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const task: TaskRecord = {
    id: 'task-stale',
    sourcePath: '/tmp/repo-stale',
    workspacePath: '/tmp/repo-stale',
    mode: 'local',
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    selectedBranch: 'main',
    worktreeBranch: null,
    status: 'active',
    ownerClientId: 'client-stale',
    lastHeartbeatAt: '2026-04-09T00:00:00.000Z',
    createdAt: '2026-04-09T00:00:00.000Z',
  };

  await saveTask(task);
  await sweepStaleTasks();

  const state = await readState();
  assert.equal(state.tasks[task.id]?.id, task.id);
  assert.equal(state.tasks[task.id]?.ownerClientId, null);
  assert.equal(state.tasks[task.id]?.lastHeartbeatAt, null);
});

test('bootstrapTask allows the same task to be opened from multiple pages', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-bootstrap-multi-page-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const activeHeartbeat = new Date().toISOString();
  const task: TaskRecord = {
    id: 'task-multi-page',
    sourcePath: '/tmp/repo-multi-page',
    workspacePath: '/tmp/repo-multi-page',
    mode: 'local',
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    selectedBranch: 'main',
    worktreeBranch: null,
    status: 'active',
    ownerClientId: 'client-a',
    lastHeartbeatAt: activeHeartbeat,
    ownerHeartbeats: {
      'client-a': activeHeartbeat,
    },
    createdAt: new Date().toISOString(),
  };

  const terminal: TerminalRecord = {
    id: 'term-main',
    taskId: task.id,
    role: 'main',
    title: 'Codex CLI main',
    tmuxSessionName: 'task-multi-page-main',
    closable: false,
    createdAt: new Date().toISOString(),
  };

  await saveTask(task);
  await saveTerminal(terminal);

  const payload = await bootstrapTask(task.id, 'client-b');
  const state = await readState();

  assert.equal(payload.terminals.length, 1);
  assert.deepEqual(Object.keys(payload.task.ownerHeartbeats ?? {}).sort(), ['client-a', 'client-b']);
  assert.deepEqual(Object.keys(state.tasks[task.id]?.ownerHeartbeats ?? {}).sort(), ['client-a', 'client-b']);
});

test('releaseTaskOwnership removes only the current page lease', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'bever-release-ownership-'));
  process.env.BEVER_HOME_DIR = tempHome;

  const now = new Date().toISOString();
  const task: TaskRecord = {
    id: 'task-release',
    sourcePath: '/tmp/repo-release',
    workspacePath: '/tmp/repo-release',
    mode: 'local',
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    selectedBranch: 'main',
    worktreeBranch: null,
    status: 'active',
    ownerClientId: 'client-b',
    lastHeartbeatAt: now,
    ownerHeartbeats: {
      'client-a': now,
      'client-b': now,
    },
    createdAt: now,
  };

  await saveTask(task);
  await releaseTaskOwnership(task.id, 'client-a');

  const state = await readState();
  assert.equal(state.tasks[task.id]?.id, task.id);
  assert.deepEqual(Object.keys(state.tasks[task.id]?.ownerHeartbeats ?? {}), ['client-b']);
});
