'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Spinner, Tabs } from '@heroui/react';
import { CircleStop, CircleXmark, FileArrowUp, Plus } from '@gravity-ui/icons';
import type { TaskRecord, TerminalRecord } from '../lib/types';
import {
  browserSupportsAbsoluteFilePaths,
  getAbsolutePathsFromFiles,
  requestInputSelection,
} from '../lib/browser-file-paths';
import { formatPathsForTerminalInput } from '../lib/shell-path-format';

type TerminalView = TerminalRecord & { url: string };

type TaskPageClientProps = {
  taskId: string;
};

type BootstrapPayload = {
  task: TaskRecord;
  terminals: TerminalView[];
};

function getTaskClientStorageKey(taskId: string) {
  return `beaver:task-client:${taskId}`;
}

function getFolderName(filePath: string): string {
  const normalizedPath = filePath.trim().replace(/[\\/]+$/, '');
  if (!normalizedPath) {
    return '';
  }
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalizedPath;
}

export function TaskPageClient({ taskId }: TaskPageClientProps) {
  const router = useRouter();
  const clientIdRef = useRef<string>('');
  const allowPageExitRef = useRef(false);
  const cleanupStartedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const terminalFrameRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [terminals, setTerminals] = useState<TerminalView[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('');
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingTerminal, setAddingTerminal] = useState(false);
  const [insertingFiles, setInsertingFiles] = useState(false);
  const [cleanupState, setCleanupState] = useState('Waiting for bootstrap...');
  const [error, setError] = useState<string | null>(null);

  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0] ?? null,
    [activeTerminalId, terminals],
  );
  const folderName = useMemo(() => (task ? getFolderName(task.sourcePath) : ''), [task]);

  const runCleanup = useCallback(
    async (keepalive = false) => {
      if (!clientIdRef.current) return;

      const body = JSON.stringify({ clientId: clientIdRef.current });
      setCleanupState('Cleaning up task...');

      if (keepalive && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const payload = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(`/api/tasks/${encodeURIComponent(taskId)}/cleanup`, payload)) {
          return;
        }
      }

      await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        keepalive,
      }).catch(() => undefined);
    },
    [taskId],
  );

  const runCleanupOnce = useCallback(
    async (keepalive = false) => {
      if (cleanupStartedRef.current) {
        return;
      }

      cleanupStartedRef.current = true;
      window.sessionStorage.removeItem(getTaskClientStorageKey(taskId));
      await runCleanup(keepalive);
    },
    [runCleanup, taskId],
  );

  useEffect(() => {
    allowPageExitRef.current = false;
    cleanupStartedRef.current = false;
  }, [taskId]);

  useEffect(() => {
    const storageKey = getTaskClientStorageKey(taskId);
    const existingClientId = window.sessionStorage.getItem(storageKey)?.trim();
    const clientId = existingClientId || crypto.randomUUID();
    clientIdRef.current = clientId;
    window.sessionStorage.setItem(storageKey, clientId);

    let cancelled = false;
    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      setCleanupState('Claiming task ownership and reconnecting terminals...');

      try {
        const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/bootstrap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ clientId: clientIdRef.current }),
        });
        const payload = (await response.json()) as BootstrapPayload & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to bootstrap task.');
        }
        if (cancelled) return;

        if (payload.task.ownerClientId) {
          clientIdRef.current = payload.task.ownerClientId;
          window.sessionStorage.setItem(storageKey, payload.task.ownerClientId);
        }
        setTask(payload.task);
        setTerminals(payload.terminals);
        setActiveTerminalId(payload.terminals[0]?.id ?? '');
        setCleanupState(
          'Task is active. Use End task to stop it manually. If browser ownership goes stale, reopening reconnects to the running task.',
        );
      } catch (bootstrapError) {
        if (cancelled) return;
        setError(bootstrapError instanceof Error ? bootstrapError.message : 'Failed to bootstrap task.');
        setCleanupState('Task bootstrap failed.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!task) return;

    const intervalId = window.setInterval(() => {
      void fetch(`/api/tasks/${encodeURIComponent(task.id)}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId: clientIdRef.current }),
      }).catch(() => undefined);
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [task]);

  useEffect(() => {
    if (!task || loading) {
      return;
    }

    const guardState = { __beaverTaskExitGuard: taskId };
    window.history.pushState(guardState, '', window.location.href);

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowPageExitRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    const handlePopState = () => {
      if (allowPageExitRef.current) {
        return;
      }

      const shouldLeave = window.confirm(
        'Leave this task page? Your task terminals will be disconnected.',
      );
      if (!shouldLeave) {
        window.history.pushState(guardState, '', window.location.href);
        return;
      }

      allowPageExitRef.current = true;
      void runCleanupOnce(false).finally(() => {
        window.history.back();
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [loading, runCleanupOnce, task, taskId]);

  async function handleAddTerminal() {
    setAddingTerminal(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/terminals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId: clientIdRef.current }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create terminal.');
      }
      const nextTerminal = payload.terminal as TerminalView;
      setTerminals((current) => [...current, nextTerminal]);
      setActiveTerminalId(nextTerminal.id);
    } catch (terminalError) {
      setError(terminalError instanceof Error ? terminalError.message : 'Failed to create terminal.');
    } finally {
      setAddingTerminal(false);
    }
  }

  async function handleInsertFiles() {
    if (!activeTerminal) {
      return;
    }

    setInsertingFiles(true);
    setError(null);
    try {
      let paths: string[] = [];
      if (browserSupportsAbsoluteFilePaths()) {
        const browserPickedPaths = await requestInputSelection(fileInputRef.current, getAbsolutePathsFromFiles);
        if (browserPickedPaths === null) {
          return;
        }
        paths = browserPickedPaths;
      } else {
        const pickResponse = await fetch('/api/fs/pick-files', {
          method: 'POST',
        });
        const pickPayload = (await pickResponse.json()) as { error?: string; paths?: string[] };
        if (!pickResponse.ok) {
          throw new Error(pickPayload.error || 'Failed to open file picker.');
        }
        paths = Array.isArray(pickPayload.paths)
          ? pickPayload.paths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [];
      }

      if (paths.length === 0) {
        return;
      }

      const activeFrame = terminalFrameRefs.current[activeTerminal.id];
      if (!activeFrame?.contentWindow) {
        throw new Error('Active terminal is not ready yet.');
      }
      activeFrame.contentWindow.postMessage(
        {
          type: 'beaver:insert-text',
          text: `${formatPathsForTerminalInput(paths)} `,
        },
        new URL(activeTerminal.url).origin,
      );
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : 'Failed to insert file paths.');
    } finally {
      setInsertingFiles(false);
    }
  }

  async function handleCloseTerminal(terminalId: string) {
    setError(null);
    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/terminals/${encodeURIComponent(terminalId)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ clientId: clientIdRef.current }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to close terminal.');
      }

      setTerminals((current) => {
        const next = current.filter((terminal) => terminal.id !== terminalId);
        if (activeTerminalId === terminalId) {
          setActiveTerminalId(next[0]?.id ?? '');
        }
        return next;
      });
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Failed to close terminal.');
    }
  }

  function startTerminalRename(terminal: TerminalView) {
    setActiveTerminalId(terminal.id);
    setEditingTerminalId(terminal.id);
    setTitleDraft(terminal.title);
    setError(null);
  }

  function cancelTerminalRename() {
    setEditingTerminalId(null);
    setTitleDraft('');
    setRenamingTerminalId(null);
  }

  async function commitTerminalRename(terminalId: string) {
    const terminal = terminals.find((entry) => entry.id === terminalId);
    if (!terminal || renamingTerminalId) {
      return;
    }

    const normalizedTitle = titleDraft.trim();
    if (!normalizedTitle) {
      setError('Terminal title is required.');
      return;
    }
    if (normalizedTitle === terminal.title) {
      cancelTerminalRename();
      return;
    }

    setRenamingTerminalId(terminalId);
    setError(null);
    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/terminals/${encodeURIComponent(terminalId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId: clientIdRef.current,
            title: normalizedTitle,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to rename terminal.');
      }

      const nextTerminal = payload.terminal as TerminalView;
      setTerminals((current) =>
        current.map((entry) => (entry.id === nextTerminal.id ? nextTerminal : entry)),
      );
      cancelTerminalRename();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Failed to rename terminal.');
      setRenamingTerminalId(null);
    }
  }

  async function handleLeaveNow() {
    allowPageExitRef.current = true;
    await runCleanupOnce(false);
    router.push('/');
  }

  return (
    <main className="h-screen overflow-hidden bg-[#0b0f14] text-[#e5e7eb]">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        tabIndex={-1}
        className="hidden"
        aria-hidden="true"
      />
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <div className="shrink-0 border-b border-white/10 bg-[#0f172a] px-2 py-2">
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Title>Task error</Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            </div>
          ) : null}

          {loading ? (
            <div className="grid flex-1 place-items-center px-6 py-12 text-sm text-[#94a3b8]">
              <div className="flex items-center gap-3">
                <Spinner size="sm" />
                <span>Starting ttyd and tmux sessions...</span>
              </div>
            </div>
          ) : terminals.length === 0 ? (
            <div className="grid flex-1 place-items-center px-6 py-12 text-sm text-[#94a3b8]">
              No terminal available.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Tabs
                selectedKey={activeTerminal?.id}
                onSelectionChange={(key) => setActiveTerminalId(String(key))}
                variant="secondary"
                className="w-full shrink-0"
              >
                <Tabs.ListContainer className="task-tabs-list-container bg-[#0b0f14] px-2">
                  <div className="flex items-center gap-1">
                    <Tabs.List aria-label="Terminal sessions" className="task-tabs-list min-w-0 flex-1">
                      {terminals.map((terminal, index) => (
                        <Tabs.Tab
                          key={terminal.id}
                          id={terminal.id}
                          className="min-h-8 rounded-none border-b-2 border-transparent px-2.5 text-xs text-[#94a3b8] transition data-[selected=true]:border-[#3b82f6] data-[selected=true]:text-white"
                        >
                          {index > 0 ? <Tabs.Separator /> : null}
                          <span className="flex items-center gap-2">
                            {editingTerminalId === terminal.id ? (
                              <input
                                value={titleDraft}
                                autoFocus
                                maxLength={80}
                                aria-label="Edit terminal title"
                                className="h-6 w-36 rounded border border-[#3b82f6] bg-[#0f172a] px-2 text-xs text-white outline-none"
                                onChange={(event) => setTitleDraft(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onDoubleClick={(event) => event.stopPropagation()}
                                onFocus={(event) => event.currentTarget.select()}
                                onBlur={() => void commitTerminalRename(terminal.id)}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void commitTerminalRename(terminal.id);
                                  } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelTerminalRename();
                                  }
                                }}
                                onKeyUp={(event) => event.stopPropagation()}
                                disabled={renamingTerminalId === terminal.id}
                              />
                            ) : (
                              <span
                                className="cursor-text whitespace-pre"
                                onDoubleClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  startTerminalRename(terminal);
                                }}
                              >
                                {terminal.title}
                              </span>
                            )}
                            {terminal.closable ? (
                              <button
                                type="button"
                                aria-label={`Close ${terminal.title}`}
                                className="grid h-5 w-5 place-items-center rounded-full text-sm leading-none text-[#64748b] transition hover:bg-white/10 hover:text-white"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void handleCloseTerminal(terminal.id);
                                }}
                              >
                                <CircleXmark aria-hidden="true" className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </span>
                        </Tabs.Tab>
                      ))}
                    </Tabs.List>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 min-w-8 px-0 text-[#cbd5e1] hover:bg-white/10"
                      onPress={() => void handleInsertFiles()}
                      isDisabled={!task || !activeTerminal || insertingFiles}
                      aria-label="Insert local file paths"
                    >
                      {insertingFiles ? <Spinner size="sm" /> : <FileArrowUp aria-hidden="true" className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 min-w-8 px-0 text-lg text-[#cbd5e1] hover:bg-white/10"
                      onPress={() => void handleAddTerminal()}
                      isDisabled={!task || addingTerminal}
                      aria-label="Open new terminal"
                    >
                      {addingTerminal ? <Spinner size="sm" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    </Button>
                  </div>
                </Tabs.ListContainer>
              </Tabs>

              <div className="relative h-0 min-h-0 flex-1 overflow-hidden bg-[#0b0f14]">
                {terminals.map((terminal) => (
                  <div
                    key={terminal.id}
                    className={terminal.id === activeTerminal?.id ? 'absolute inset-0 block' : 'hidden'}
                    aria-hidden={terminal.id === activeTerminal?.id ? undefined : true}
                  >
                    <iframe
                      ref={(node) => {
                        terminalFrameRefs.current[terminal.id] = node;
                      }}
                      src={terminal.url}
                      title={terminal.title}
                      scrolling="no"
                      className="absolute inset-0 block h-full w-full border-0 bg-[#0b0f14]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#0f172a] max-[599px]:hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <div className="hidden min-w-0 flex-1 items-center gap-x-2 gap-y-1 overflow-hidden text-[10px] leading-4 text-[#94a3b8] min-[600px]:flex">
              {task ? (
                <>
                  <span
                    className="max-w-full truncate min-[1200px]:hidden"
                    title={task.sourcePath}
                  >
                    {folderName}
                  </span>
                  <span
                    className="max-w-full truncate max-[1199px]:hidden"
                    title={task.sourcePath}
                  >
                    {task.sourcePath}
                  </span>
                  <span className="truncate" title={`mode: ${task.mode}`}>
                    {`mode: ${task.mode}`}
                  </span>
                  <span className="truncate" title={`branch: ${task.selectedBranch}`}>
                    {`branch: ${task.selectedBranch}`}
                  </span>
                  <span className="truncate" title={`provider: ${task.provider}`}>
                    {`provider: ${task.provider}`}
                  </span>
                  <span className="truncate max-[999px]:hidden" title={`model: ${task.model}`}>
                    {`model: ${task.model}`}
                  </span>
                </>
              ) : null}
              {!error && cleanupState ? (
                <span className="truncate text-[#64748b] max-[999px]:hidden" title={cleanupState}>
                  {cleanupState}
                </span>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 min-w-0 px-2 text-[11px] text-[#cbd5e1] hover:bg-white/10"
              onPress={() => void handleLeaveNow()}
              isDisabled={!task}
            >
              <span className="flex items-center gap-1.5">
                <CircleStop aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>End task</span>
              </span>
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="fixed bottom-3 right-3 z-20 hidden h-11 w-11 min-w-0 rounded-full border border-white/10 bg-[#0f172a]/95 px-0 text-[#cbd5e1] shadow-lg shadow-black/30 hover:bg-white/10 max-[599px]:inline-flex"
          onPress={() => void handleLeaveNow()}
          isDisabled={!task}
          aria-label="End task"
        >
          <CircleStop aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </main>
  );
}
