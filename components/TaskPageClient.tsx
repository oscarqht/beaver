'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaskRecord, TerminalRecord } from '../lib/types';

type TerminalView = TerminalRecord & { url: string };

type TaskPageClientProps = {
  taskId: string;
};

type BootstrapPayload = {
  task: TaskRecord;
  terminals: TerminalView[];
};

export function TaskPageClient({ taskId }: TaskPageClientProps) {
  const router = useRouter();
  const clientIdRef = useRef<string>('');
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [terminals, setTerminals] = useState<TerminalView[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [addingTerminal, setAddingTerminal] = useState(false);
  const [cleanupState, setCleanupState] = useState('Waiting for bootstrap...');
  const [error, setError] = useState<string | null>(null);

  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0] ?? null,
    [activeTerminalId, terminals],
  );

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

  useEffect(() => {
    clientIdRef.current = crypto.randomUUID();

    let cancelled = false;
    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      setCleanupState('Claiming task ownership and starting terminals...');

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

        setTask(payload.task);
        setTerminals(payload.terminals);
        setActiveTerminalId(payload.terminals[0]?.id ?? '');
        setCleanupState('Task is active. The browser tab owns terminal cleanup.');
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

    const handlePageHide = () => {
      void runCleanup(true);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [runCleanup, taskId]);

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

  async function handleLeaveNow() {
    await runCleanup(false);
    router.push('/');
  }

  return (
    <main className="shell">
      <div className="container task-layout">
        <section className="card task-topbar">
          <div className="task-heading">
            <h1>Task {taskId.slice(0, 8)}</h1>
            <p>
              {task
                ? 'Shared ttyd stays alive, while this browser tab owns the task terminals and cleanup.'
                : 'Bootstrapping task workspace and terminal sessions.'}
            </p>
          </div>

          <div className="task-meta">
            {task ? <span className="pill">{task.sourcePath}</span> : null}
            {task ? <span className="pill">mode: {task.mode}</span> : null}
            {task ? <span className="pill">branch: {task.selectedBranch}</span> : null}
            {task ? <span className="pill">provider: {task.provider}</span> : null}
            {task ? <span className="pill">model: {task.model}</span> : null}
          </div>

          {error ? <div className="status error">{error}</div> : null}
          {!error ? <div className="status">{cleanupState}</div> : null}

          <div className="action-row">
            <button className="button" type="button" onClick={() => void handleAddTerminal()} disabled={!task || addingTerminal}>
              {addingTerminal ? 'Opening...' : 'New terminal'}
            </button>
            <button className="button ghost" type="button" onClick={() => void handleLeaveNow()} disabled={!task}>
              End task now
            </button>
          </div>
        </section>

        <section className="card terminal-shell">
          <div className="tab-row">
            {terminals.map((terminal) => (
              <button
                key={terminal.id}
                className={`tab ${activeTerminal?.id === terminal.id ? 'active' : ''}`}
                type="button"
                onClick={() => setActiveTerminalId(terminal.id)}
              >
                <span>{terminal.title}</span>
                {terminal.closable ? (
                  <span
                    className="tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleCloseTerminal(terminal.id);
                    }}
                  >
                    ×
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="empty-state">Starting ttyd and tmux sessions...</div>
          ) : activeTerminal ? (
            <iframe
              key={activeTerminal.id}
              className="terminal-frame"
              src={activeTerminal.url}
              title={activeTerminal.title}
            />
          ) : (
            <div className="empty-state">No terminal available.</div>
          )}
        </section>
      </div>
    </main>
  );
}
