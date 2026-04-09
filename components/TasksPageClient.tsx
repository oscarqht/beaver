'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Separator, Spinner } from '@heroui/react';
import type { TaskRecord } from '../lib/types';

type TasksResponse = {
  tasks?: TaskRecord[];
  error?: string;
};

type AutoTheme = 'light' | 'dark';

function getFolderName(filePath: string): string {
  const normalizedPath = filePath.trim().replace(/[\\/]+$/, '');
  if (!normalizedPath) {
    return '';
  }

  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalizedPath;
}

function formatTimestamp(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStatusLabel(task: TaskRecord): string {
  if (task.status === 'active' && task.ownerClientId) {
    return 'active';
  }
  return task.status;
}

function getStatusClassName(task: TaskRecord, theme: AutoTheme): string {
  switch (task.status) {
    case 'active':
      return theme === 'dark'
        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
        : 'border-emerald-300 bg-emerald-50 text-emerald-700';
    case 'cleaning':
      return theme === 'dark'
        ? 'border-amber-500/35 bg-amber-500/10 text-amber-100'
        : 'border-amber-300 bg-amber-50 text-amber-700';
    default:
      return theme === 'dark'
        ? 'border-white/10 bg-white/5 text-[#cbd5e1]'
        : 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

export function TasksPageClient() {
  const router = useRouter();
  const [theme, setTheme] = useState<AutoTheme>('light');
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTasks = tasks.length > 0;

  const taskCountLabel = useMemo(() => {
    if (tasks.length === 1) {
      return '1 ongoing task';
    }
    return `${tasks.length} ongoing tasks`;
  }, [tasks.length]);

  const rowSurfaceClass =
    theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-black/[0.02]';
  const subtleTextClass = theme === 'dark' ? 'text-[#94a3b8]' : 'text-[#64748b]';
  const secondaryTextClass = theme === 'dark' ? 'text-[#cbd5e1]' : 'text-[#475569]';
  const deleteButtonClass =
    theme === 'dark'
      ? 'bg-[#7f1d1d] text-white hover:bg-[#991b1b] disabled:bg-white/10 disabled:text-[#94a3b8]'
      : 'bg-[#991b1b] text-white hover:bg-[#7f1d1d] disabled:bg-slate-200 disabled:text-slate-500';
  const primaryButtonClass =
    theme === 'dark'
      ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:bg-white/10 disabled:text-[#94a3b8]'
      : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:bg-slate-200 disabled:text-slate-500';

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      setTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    syncTheme();
    mediaQuery.addEventListener?.('change', syncTheme);
    return () => {
      mediaQuery.removeEventListener?.('change', syncTheme);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlTheme = html.getAttribute('data-theme');
    const previousBodyTheme = body.getAttribute('data-theme');
    const previousHtmlDark = html.classList.contains('dark');
    const previousBodyDark = body.classList.contains('dark');

    html.setAttribute('data-theme', theme);
    body.setAttribute('data-theme', theme);
    html.classList.toggle('dark', theme === 'dark');
    body.classList.toggle('dark', theme === 'dark');

    return () => {
      if (previousHtmlTheme) {
        html.setAttribute('data-theme', previousHtmlTheme);
      } else {
        html.removeAttribute('data-theme');
      }
      if (previousBodyTheme) {
        body.setAttribute('data-theme', previousBodyTheme);
      } else {
        body.removeAttribute('data-theme');
      }
      html.classList.toggle('dark', previousHtmlDark);
      body.classList.toggle('dark', previousBodyDark);
    };
  }, [theme]);

  const loadTasks = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/tasks');
      const payload = (await response.json()) as TasksResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load tasks.');
      }

      setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks(false);
  }, [loadTasks]);

  async function handleDeleteTask(task: TaskRecord) {
    const confirmed = window.confirm(
      `Delete "${getFolderName(task.sourcePath) || task.sourcePath}"? This will stop its terminals and remove its workspace state.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingTaskId(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { deletedTaskId?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete task.');
      }

      setTasks((current) => current.filter((entry) => entry.id !== payload.deletedTaskId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete task.');
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function handleDeleteAllTasks() {
    if (!tasks.length) {
      return;
    }

    const confirmed = window.confirm(
      `Delete all ${tasks.length} tasks? This will stop every terminal and remove each task workspace state.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingAll(true);
    setError(null);
    try {
      const response = await fetch('/api/tasks', {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { deletedTaskIds?: string[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete tasks.');
      }

      const deletedTaskIds = new Set(payload.deletedTaskIds ?? []);
      setTasks((current) => current.filter((task) => !deletedTaskIds.has(task.id)));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete tasks.');
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <main
      data-theme={theme}
      className="home-shell home-main min-h-screen px-4 py-6 transition-colors duration-200 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Card className="home-card border border-default-200/70 backdrop-blur-xl" variant="default">
          <Card.Header className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted">Tasks</p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ongoing tasks</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onPress={() => router.push('/')}>
                New task
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => void loadTasks(true)}
                isDisabled={loading || refreshing}
              >
                {refreshing ? <Spinner size="sm" /> : 'Refresh'}
              </Button>
              <Button
                size="sm"
                className={deleteButtonClass}
                onPress={() => void handleDeleteAllTasks()}
                isDisabled={!hasTasks || deletingAll}
              >
                {deletingAll ? <Spinner size="sm" /> : 'Delete all'}
              </Button>
            </div>
          </Card.Header>

          <Separator />

          <Card.Content className="flex flex-col gap-3 px-5 py-4 sm:px-6">
            {error ? (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Title>Could not update tasks</Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <p className="text-sm text-muted">{loading ? 'Loading tasks...' : taskCountLabel}</p>

            {loading ? (
              <div className={`grid min-h-56 place-items-center rounded-2xl border px-6 py-12 text-sm text-muted ${rowSurfaceClass}`}>
                <div className="flex items-center gap-3">
                  <Spinner size="sm" />
                  <span>Loading tasks...</span>
                </div>
              </div>
            ) : hasTasks ? (
              <div className={`overflow-hidden rounded-2xl border ${rowSurfaceClass}`}>
                <div className={`hidden grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto_auto_auto] gap-3 border-b px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] md:grid ${rowSurfaceClass} ${subtleTextClass}`}>
                  <span>Task</span>
                  <span>Branch</span>
                  <span>Provider</span>
                  <span>Mode</span>
                  <span>Created</span>
                  <span className="text-right">Actions</span>
                </div>
                {tasks.map((task) => {
                  const folderName = getFolderName(task.sourcePath);
                  const isDeleting = deletingTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      className={`grid gap-2 border-t px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto_auto_auto] md:items-center md:gap-3 ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {folderName || task.sourcePath}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${getStatusClassName(task, theme)}`}
                          >
                            {getStatusLabel(task)}
                          </span>
                        </div>
                        <p className={`truncate text-xs md:hidden ${subtleTextClass}`} title={task.sourcePath}>
                          {task.selectedBranch}
                          <span className="text-[#64748b]"> · </span>
                          {task.provider}
                          <span className="text-[#64748b]"> · </span>
                          {formatTimestamp(task.createdAt)}
                        </p>
                        <p className={`hidden truncate text-xs lg:block ${subtleTextClass}`} title={task.sourcePath}>
                          {task.sourcePath}
                        </p>
                      </div>

                      <div className={`hidden truncate text-sm md:block ${secondaryTextClass}`} title={task.selectedBranch}>
                        {task.selectedBranch}
                      </div>

                      <div className={`hidden truncate text-sm md:block ${secondaryTextClass}`}>
                        {task.provider}
                        <span className="text-[#64748b]"> · </span>
                        {task.model}
                      </div>

                      <div className={`hidden text-sm md:block ${secondaryTextClass}`}>{task.mode}</div>

                      <div className={`hidden whitespace-nowrap text-sm md:block ${secondaryTextClass}`}>
                        {formatTimestamp(task.createdAt)}
                      </div>

                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
                          isDisabled={isDeleting || deletingAll}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          className={deleteButtonClass}
                          onPress={() => void handleDeleteTask(task)}
                          isDisabled={deletingAll || isDeleting}
                        >
                          {isDeleting ? <Spinner size="sm" /> : 'Delete'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`grid min-h-56 place-items-center rounded-2xl border border-dashed px-6 py-12 text-center ${rowSurfaceClass}`}>
                <div className="max-w-md space-y-3">
                  <h2 className="text-xl font-semibold text-foreground">No ongoing tasks</h2>
                  <p className="text-sm leading-7 text-muted">
                    Start a new task from the home page and it will show up here while its terminal sessions are still around.
                  </p>
                  <Button
                    className={primaryButtonClass}
                    onPress={() => router.push('/')}
                  >
                    Start a task
                  </Button>
                </div>
              </div>
            )}
          </Card.Content>
        </Card>
      </div>
    </main>
  );
}
