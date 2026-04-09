import { randomUUID } from 'node:crypto';
import { getProviderConfig, getReasoningOptions } from './provider-config';
import { checkoutBranch, createWorktree, removeWorktree, resolveGitRepositoryPath } from './git';
import {
  deleteTaskAndTerminals,
  deleteTerminal,
  getTask,
  listTasks as listStoredTasks,
  getTaskTerminals,
  rememberRecentRepoPath,
  readState,
  saveTask,
  saveTerminal,
  updateState,
} from './store';
import { buildTerminalUrl, createTerminalSession, killTmuxSession } from './terminal';
import type {
  ProviderId,
  ReasoningEffort,
  TaskMode,
  TaskRecord,
  TerminalRecord,
} from './types';

const HEARTBEAT_TIMEOUT_MS = 30_000;

declare global {
  // eslint-disable-next-line no-var
  var __beaverTaskBootstrapChains: Map<string, Promise<void>> | undefined;
}

type CreateTaskInput = {
  sourcePath: string;
  mode: TaskMode;
  provider: ProviderId;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  selectedBranch: string;
};

export function serializeTerminal(terminal: TerminalRecord) {
  return {
    ...terminal,
    url: buildTerminalUrl(terminal.tmuxSessionName),
  };
}

export function splitMainTerminalDuplicates(terminals: TerminalRecord[]) {
  const sorted = [...terminals].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const mainTerminals = sorted.filter((terminal) => terminal.role === 'main');
  const primaryMainTerminal = mainTerminals[0] ?? null;
  const duplicateMainTerminals = mainTerminals.slice(1);

  return {
    primaryMainTerminal,
    duplicateMainTerminals,
    normalizedTerminals: primaryMainTerminal
      ? sorted.filter((terminal) => terminal.role !== 'main' || terminal.id === primaryMainTerminal.id)
      : sorted,
  };
}

async function runBootstrapExclusive<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
  const chains = global.__beaverTaskBootstrapChains ?? new Map<string, Promise<void>>();
  global.__beaverTaskBootstrapChains = chains;

  const previous = chains.get(taskId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  chains.set(taskId, previous.catch(() => undefined).then(() => next));

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (chains.get(taskId) === next) {
      chains.delete(taskId);
    }
  }
}

function isTaskStale(task: TaskRecord): boolean {
  if (!task.ownerClientId || !task.lastHeartbeatAt) return false;
  return Date.now() - new Date(task.lastHeartbeatAt).getTime() > HEARTBEAT_TIMEOUT_MS;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  const sourcePath = await resolveGitRepositoryPath(input.sourcePath);
  if (!input.selectedBranch.trim()) {
    throw new Error('A Git branch must be selected.');
  }
  const provider = getProviderConfig(input.provider);
  const model = provider.models.find((entry) => entry.id === input.model);
  if (!model) {
    throw new Error('Unsupported model for the selected provider.');
  }

  const allowedReasoning = getReasoningOptions(input.provider, input.model);
  if (allowedReasoning.length > 0 && input.reasoningEffort && !allowedReasoning.includes(input.reasoningEffort)) {
    throw new Error('Unsupported reasoning effort for the selected model.');
  }

  const task: TaskRecord = {
    id: randomUUID(),
    sourcePath,
    workspacePath: '',
    mode: input.mode,
    provider: input.provider,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    selectedBranch: input.selectedBranch,
    worktreeBranch: null,
    status: 'pending',
    ownerClientId: null,
    lastHeartbeatAt: null,
    createdAt: new Date().toISOString(),
  };

  await rememberRecentRepoPath(sourcePath);
  return await saveTask(task);
}

export async function getTaskDetails(taskId: string) {
  const task = await getTask(taskId);
  if (!task) return null;
  const terminals = await getTaskTerminals(taskId);
  const stale = isTaskStale(task);
  return {
    task,
    terminals: terminals.map(serializeTerminal),
    ownership: {
      claimed: Boolean(task.ownerClientId) && !stale,
      stale,
    },
  };
}

export async function listTasks() {
  await sweepStaleTasks();
  return listStoredTasks();
}

export async function sweepStaleTasks(): Promise<void> {
  await updateState((state) => {
    for (const task of Object.values(state.tasks)) {
      if (!isTaskStale(task)) {
        continue;
      }

      task.ownerClientId = null;
      task.lastHeartbeatAt = null;
    }
  });
}

function assertOwner(task: TaskRecord, clientId: string, allowStale = false): void {
  if (!task.ownerClientId) {
    throw new Error('Task is not claimed yet.');
  }
  if (task.ownerClientId === clientId) return;
  if (allowStale && isTaskStale(task)) return;
  throw new Error('Task is already open in another browser tab.');
}

export async function bootstrapTask(taskId: string, clientId: string) {
  return runBootstrapExclusive(taskId, async () => {
    await sweepStaleTasks();

    const task = await getTask(taskId);
    if (!task) {
      throw new Error('Task not found.');
    }

    if (task.ownerClientId && task.ownerClientId !== clientId && !isTaskStale(task)) {
      throw new Error('Task is already owned by another browser tab.');
    }

    let nextTask = task;
    let nextTerminals = await getTaskTerminals(taskId);
    const {
      primaryMainTerminal,
      duplicateMainTerminals,
      normalizedTerminals,
    } = splitMainTerminalDuplicates(nextTerminals);

    if (duplicateMainTerminals.length > 0) {
      for (const duplicateTerminal of duplicateMainTerminals) {
        await killTmuxSession(duplicateTerminal.tmuxSessionName);
        await deleteTerminal(duplicateTerminal.id);
      }
      nextTerminals = normalizedTerminals;
    }

    if (!task.workspacePath) {
      if (task.mode === 'local') {
        await checkoutBranch(task.sourcePath, task.selectedBranch);
        nextTask = {
          ...task,
          workspacePath: task.sourcePath,
        };
      } else {
        const worktree = await createWorktree(task.sourcePath, task.id, task.selectedBranch);
        nextTask = {
          ...task,
          workspacePath: worktree.workspacePath,
          worktreeBranch: worktree.worktreeBranch,
        };
      }
    }

    nextTask = {
      ...nextTask,
      ownerClientId: clientId,
      lastHeartbeatAt: new Date().toISOString(),
      status: 'active',
    };
    await saveTask(nextTask);

    if (!primaryMainTerminal) {
      const provider = getProviderConfig(nextTask.provider);
      const mainTerminal = await createTerminalSession({
        task: nextTask,
        title: `${provider.label} main`,
        role: 'main',
        closable: false,
        command: provider.buildCommand({
          model: nextTask.model,
          reasoningEffort: nextTask.reasoningEffort,
        }),
      });
      await saveTerminal(mainTerminal);
      nextTerminals = [...nextTerminals, mainTerminal].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    }

    return {
      task: nextTask,
      terminals: nextTerminals.map(serializeTerminal),
    };
  });
}

export async function createExtraTerminal(taskId: string, clientId: string) {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found.');
  assertOwner(task, clientId);
  const terminal = await createTerminalSession({
    task,
    title: `Shell ${new Date().toLocaleTimeString()}`,
    role: 'shell',
    closable: true,
  });
  await saveTerminal(terminal);
  return serializeTerminal(terminal);
}

export async function removeTerminal(taskId: string, terminalId: string, clientId: string) {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found.');
  assertOwner(task, clientId);

  const terminals = await getTaskTerminals(taskId);
  const terminal = terminals.find((entry) => entry.id === terminalId);
  if (!terminal) throw new Error('Terminal not found.');
  if (!terminal.closable) {
    throw new Error('The main terminal cannot be closed.');
  }

  await killTmuxSession(terminal.tmuxSessionName);
  await deleteTerminal(terminal.id);
}

export async function renameTerminal(
  taskId: string,
  terminalId: string,
  clientId: string,
  title: string,
) {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error('Terminal title is required.');
  }
  if (normalizedTitle.length > 80) {
    throw new Error('Terminal title must be 80 characters or fewer.');
  }

  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found.');
  assertOwner(task, clientId);

  const terminals = await getTaskTerminals(taskId);
  const terminal = terminals.find((entry) => entry.id === terminalId);
  if (!terminal) throw new Error('Terminal not found.');

  const nextTerminal = {
    ...terminal,
    title: normalizedTitle,
  };
  await saveTerminal(nextTerminal);
  return serializeTerminal(nextTerminal);
}

export async function refreshHeartbeat(taskId: string, clientId: string) {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found.');
  assertOwner(task, clientId, true);
  const nextTask = {
    ...task,
    ownerClientId: clientId,
    lastHeartbeatAt: new Date().toISOString(),
  };
  await saveTask(nextTask);
  return nextTask;
}

export async function cleanupTask(
  taskId: string,
  input: { clientId?: string; ignoreOwner?: boolean } = {},
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  if (!input.ignoreOwner) {
    if (!input.clientId) {
      throw new Error('clientId is required.');
    }
    assertOwner(task, input.clientId, true);
  }

  const terminals = await getTaskTerminals(taskId);
  await updateState((state) => {
    if (state.tasks[taskId]) {
      state.tasks[taskId].status = 'cleaning';
    }
  });

  for (const terminal of terminals) {
    await killTmuxSession(terminal.tmuxSessionName);
  }

  if (task.mode === 'worktree' && task.workspacePath) {
    await removeWorktree(task.sourcePath, task.workspacePath, task.worktreeBranch);
  }

  await deleteTaskAndTerminals(taskId);
}

export async function deleteTask(taskId: string): Promise<void> {
  await cleanupTask(taskId, { ignoreOwner: true });
}

export async function deleteAllTasks(): Promise<string[]> {
  const tasks = await listStoredTasks();

  for (const task of tasks) {
    await cleanupTask(task.id, { ignoreOwner: true });
  }

  return tasks.map((task) => task.id);
}
