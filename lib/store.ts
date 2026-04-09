import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDirectory, resolveBeverHomeDir } from './fs-utils';
import type { BeverState, TaskRecord, TerminalRecord } from './types';

function createDefaultState(): BeverState {
  return {
    version: 1,
    tasks: {},
    terminals: {},
  };
}

function getStatePath(): string {
  return path.join(resolveBeverHomeDir(), 'state.json');
}

export async function readState(): Promise<BeverState> {
  const statePath = getStatePath();
  try {
    const content = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(content) as Partial<BeverState>;
    return {
      version: 1,
      tasks: parsed.tasks ?? {},
      terminals: parsed.terminals ?? {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createDefaultState();
    }
    throw error;
  }
}

export async function writeState(state: BeverState): Promise<void> {
  const homeDir = resolveBeverHomeDir();
  await ensureDirectory(homeDir);
  const statePath = getStatePath();
  const tempPath = `${statePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tempPath, statePath);
}

export async function updateState(
  updater: (state: BeverState) => void | BeverState,
): Promise<BeverState> {
  const state = await readState();
  const next = updater(state) ?? state;
  await writeState(next);
  return next;
}

export async function saveTask(task: TaskRecord): Promise<TaskRecord> {
  await updateState((state) => {
    state.tasks[task.id] = task;
  });
  return task;
}

export async function saveTerminal(terminal: TerminalRecord): Promise<TerminalRecord> {
  await updateState((state) => {
    state.terminals[terminal.id] = terminal;
  });
  return terminal;
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const state = await readState();
  return state.tasks[taskId] ?? null;
}

export async function getTaskTerminals(taskId: string): Promise<TerminalRecord[]> {
  const state = await readState();
  return Object.values(state.terminals)
    .filter((terminal) => terminal.taskId === taskId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function deleteTaskAndTerminals(taskId: string): Promise<void> {
  await updateState((state) => {
    delete state.tasks[taskId];
    for (const terminal of Object.values(state.terminals)) {
      if (terminal.taskId === taskId) {
        delete state.terminals[terminal.id];
      }
    }
  });
}

export async function deleteTerminal(terminalId: string): Promise<void> {
  await updateState((state) => {
    delete state.terminals[terminalId];
  });
}
