import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TaskRecord, TerminalRecord, TerminalRole } from './types';

const TTYD_PORT = 7681;
const TTYD_INDEX_CACHE_PATH = path.join(os.homedir(), '.beaver', 'ttyd', 'index.html');
const TTYD_PATCH_MARKER = 'beaver-ttyd-patch-v2';

declare global {
  // eslint-disable-next-line no-var
  var __beverTtydProcess: ChildProcess | undefined;
}

function getShell(): string {
  return process.env.SHELL?.trim() || '/bin/zsh';
}

function getTtydArgs(port: number, indexPath?: string): string[] {
  return [
    '-p',
    String(port),
    '-W',
    '-t',
    'disableLeaveAlert=true',
    '-t',
    'disableResizeOverlay=true',
    '-t',
    'fontSize=13',
    '-w',
    os.homedir(),
    ...(indexPath ? ['-I', indexPath] : []),
    '-a',
    'tmux',
  ];
}

export function patchTtydIndexHtml(html: string): string {
  if (html.includes(TTYD_PATCH_MARKER)) {
    return html;
  }

  const styleOverride = [
    `<meta name="beaver-ttyd-patch" content="${TTYD_PATCH_MARKER}">`,
    '<style type="text/css">',
    '.xterm .xterm-viewport{overflow:hidden!important;overflow-y:hidden!important;scrollbar-width:none!important;}',
    '.xterm .xterm-viewport::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}',
    '</style>',
  ].join('');
  const scriptOverride = [
    `<script data-beaver-patch="${TTYD_PATCH_MARKER}">`,
    '(()=>{',
    'const apply=()=>{',
    "document.querySelectorAll('.xterm-viewport').forEach((element)=>{",
    "element.style.overflow='hidden';",
    "element.style.overflowY='hidden';",
    "element.style.scrollbarWidth='none';",
    '});',
    "document.documentElement.style.overflow='hidden';",
    "document.body.style.overflow='hidden';",
    '};',
    "window.addEventListener('load',apply);",
    'new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});',
    'window.setInterval(apply,250);',
    '})();',
    '</script>',
  ].join('');
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${styleOverride}</head>`);
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${scriptOverride}</body>`);
  }
  return `${html}${styleOverride}${scriptOverride}`;
}

function ttydHtmlHasPatch(html: string): boolean {
  return html.includes(TTYD_PATCH_MARKER);
}

async function waitForHttp(url: string, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getTtydHtml(port: number): Promise<string | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`);
    if (!response.ok) {
      return undefined;
    }
    return await response.text();
  } catch {
    return undefined;
  }
}

function stopProcessOnPort(port: number): void {
  const lookup = spawnSync('lsof', ['-ti', `tcp:${port}`], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const pids = lookup.stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const pid of pids) {
    spawnSync('kill', ['-TERM', pid], { stdio: 'ignore' });
  }
}

function applySharedTmuxStyles(): void {
  spawnSync('tmux', ['start-server'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'mouse', 'on'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'history-limit', '200000'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'status-style', 'bg=#0f172a,fg=#94a3b8'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'message-style', 'bg=#111827,fg=#e5e7eb'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'mode-style', 'bg=#1d4ed8,fg=#e5e7eb'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'window-status-style', 'bg=#0f172a,fg=#64748b'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'window-status-current-style', 'bg=#111827,fg=#e5e7eb,bold'], {
    stdio: 'ignore',
  });
  spawnSync('tmux', ['set-option', '-g', 'window-status-current-format', ' #W '], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'window-status-format', ' #W '], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'status-left-style', 'bg=#0f172a,fg=#94a3b8'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'status-right-style', 'bg=#0f172a,fg=#94a3b8'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'pane-border-style', 'fg=#1f2937'], { stdio: 'ignore' });
  spawnSync('tmux', ['set-option', '-g', 'pane-active-border-style', 'fg=#334155'], { stdio: 'ignore' });
}

async function ensurePatchedTtydIndex(): Promise<string | undefined> {
  try {
    const cachedHtml = await readFile(TTYD_INDEX_CACHE_PATH, 'utf8');
    if (ttydHtmlHasPatch(cachedHtml)) {
      return TTYD_INDEX_CACHE_PATH;
    }
  } catch {
    // Cache miss; build it below.
  }

  const tempPort = 7699;
  const child = spawn('ttyd', getTtydArgs(tempPort), {
    stdio: 'ignore',
    detached: false,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${tempPort}`);
    const response = await fetch(`http://127.0.0.1:${tempPort}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ttyd index: ${response.status}`);
    }
    const html = await response.text();
    const patchedHtml = patchTtydIndexHtml(html);
    await mkdir(path.dirname(TTYD_INDEX_CACHE_PATH), { recursive: true });
    await writeFile(TTYD_INDEX_CACHE_PATH, patchedHtml, 'utf8');
    return TTYD_INDEX_CACHE_PATH;
  } catch {
    return undefined;
  } finally {
    child.kill('SIGTERM');
  }
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
  applySharedTmuxStyles();
  const indexPath = await ensurePatchedTtydIndex();
  const runningHtml = await getTtydHtml(TTYD_PORT);
  const runningTtydIsPatched = runningHtml ? ttydHtmlHasPatch(runningHtml) : false;

  if (global.__beverTtydProcess && !(global.__beverTtydProcess.killed) && runningTtydIsPatched) {
    return;
  }
  if (runningHtml && !runningHtml.includes('ttyd - Terminal')) {
    throw new Error(`Port ${TTYD_PORT} is already occupied by another service.`);
  }
  if (runningHtml && !runningTtydIsPatched) {
    if (global.__beverTtydProcess && !(global.__beverTtydProcess.killed)) {
      global.__beverTtydProcess.kill('SIGTERM');
      global.__beverTtydProcess = undefined;
    }
    stopProcessOnPort(TTYD_PORT);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (await isTtydResponsive()) {
    return;
  }

  const child = spawn('ttyd', getTtydArgs(TTYD_PORT, indexPath), {
    stdio: 'ignore',
    detached: false,
  });

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
