import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { TaskRecord, TerminalRecord, TerminalRole } from './types';
const TTYD_PORT = 7681;

declare global {
  // eslint-disable-next-line no-var
  var __beverTtydProcess: ChildProcess | undefined;
}

function getShell(): string {
  return process.env.SHELL?.trim() || '/bin/zsh';
}

export function makeTmuxSessionName(taskId: string, terminalId: string): string {
  return `bever-${taskId.slice(0, 16)}-${terminalId.slice(0, 12)}`;
}

export function buildTerminalUrl(tmuxSessionName: string): string {
  const params = new URLSearchParams();
  params.append('arg', 'new-session');
  params.append('arg', '-A');
  params.append('arg', '-s');
  params.append('arg', tmuxSessionName);
  return `http://127.0.0.1:${TTYD_PORT}/?${params.toString()}`;
}

async function isTtydResponsive(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${TTYD_PORT}`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureTtyd(): Promise<void> {
  if (global.__beverTtydProcess && !(global.__beverTtydProcess.killed)) {
    return;
  }
  if (await isTtydResponsive()) {
    return;
  }

  spawnSync('tmux', ['start-server'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'mouse', 'on'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'history-limit', '200000'], { stdio: 'ignore' });

  const child = spawn(
    'ttyd',
    [
      '-p',
      String(TTYD_PORT),
      '-W',
      '-t',
      'disableLeaveAlert=true',
      '-t',
      'disableResizeOverlay=true',
      '-t',
      'fontSize=13',
      '-w',
      os.homedir(),
      '-a',
      'tmux',
    ],
    {
      stdio: 'ignore',
      detached: false,
    },
  );

  child.on('exit', () => {
    global.__beverTtydProcess = undefined;
  });
  child.on('error', () => {
    global.__beverTtydProcess = undefined;
  });
  global.__beverTtydProcess = child;

  await new Promise((resolve) => setTimeout(resolve, 700));
}

function createTmuxBootstrapCommand(command?: string): string[] {
  const shell = getShell();
  if (!command) {
    return [shell, '-l'];
  }
  return [shell, '-lc', `${command}\nexec ${shell} -l`];
}

export async function createTerminalSession(input: {
  task: TaskRecord;
  terminalId?: string;
  title: string;
  role: TerminalRole;
  closable: boolean;
  command?: string;
}): Promise<TerminalRecord> {
  await ensureTtyd();
  const terminalId = input.terminalId ?? randomUUID();
  const tmuxSessionName = makeTmuxSessionName(input.task.id, terminalId);
  const bootstrapCommand = createTmuxBootstrapCommand(input.command);
  const result = spawnSync(
    'tmux',
    ['new-session', '-d', '-s', tmuxSessionName, '-c', input.task.workspacePath, ...bootstrapCommand],
    { stdio: 'pipe', encoding: 'utf8' },
  );

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Failed to start tmux session.');
  }

  return {
    id: terminalId,
    taskId: input.task.id,
    role: input.role,
    title: input.title,
    tmuxSessionName,
    closable: input.closable,
    createdAt: new Date().toISOString(),
  };
}

export async function killTmuxSession(tmuxSessionName: string): Promise<void> {
  spawnSync('tmux', ['kill-session', '-t', tmuxSessionName], { stdio: 'ignore' });
}
