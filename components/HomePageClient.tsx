'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, ButtonGroup, Card, Label, ListBox, Select, Separator, Spinner, Tabs } from '@heroui/react';
import { CodeFork, FolderArrowRight, Play, Terminal } from '@gravity-ui/icons';
import type { BranchOption, ProviderId, ReasoningEffort, TaskMode } from '../lib/types';
import { getMostRecentRepoPath } from '../lib/recent-repos';

const REPO_PREFERENCES_STORAGE_KEY = 'beaver:repo-preferences';

type StoredRepoPreferences = {
  providerId: ProviderId;
  modelId: string;
  reasoningEffort: ReasoningEffort | '';
  mode: TaskMode;
  selectedBranch?: string;
};

type HomePageClientProps = {
  providers: Array<{
    id: ProviderId;
    label: string;
    models: Array<{
      id: string;
      label: string;
      description: string;
      reasoningEfforts?: ReasoningEffort[];
    }>;
  }>;
  recentRepoPaths: string[];
};

type AutoTheme = 'light' | 'dark';

export function HomePageClient({ providers, recentRepoPaths: initialRecentRepoPaths }: HomePageClientProps) {
  const router = useRouter();
  const hasInitializedRepoSelection = useRef(false);
  const [theme, setTheme] = useState<AutoTheme>('light');
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [recentRepoPaths, setRecentRepoPaths] = useState(initialRecentRepoPaths);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [mode, setMode] = useState<TaskMode>('local');
  const [providerId, setProviderId] = useState<ProviderId>('codex');
  const [modelId, setModelId] = useState(providers[0]?.models[0]?.id ?? '');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | ''>('low');
  const [browsingFolder, setBrowsingFolder] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId) ?? providers[0],
    [providerId, providers],
  );

  const selectedModel = useMemo(
    () => selectedProvider.models.find((model) => model.id === modelId) ?? selectedProvider.models[0],
    [modelId, selectedProvider],
  );

  const availableReasoning = selectedModel?.reasoningEfforts ?? [];

  const repoOptions = useMemo(() => {
    if (!repoPath.trim() || recentRepoPaths.includes(repoPath.trim())) {
      return recentRepoPaths;
    }
    return [repoPath.trim(), ...recentRepoPaths].slice(0, 10);
  }, [recentRepoPaths, repoPath]);

  const repoOptionsWithLabels = useMemo(() => {
    const labelCounts = new Map<string, number>();

    for (const option of repoOptions) {
      const label = getRepoLabel(option);
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }

    return repoOptions.map((option) => {
      const label = getRepoLabel(option);
      const normalizedPath = option.trim().replace(/[\\/]+$/, '');
      const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
      const parentLabel = segments.at(-2);

      return {
        path: option,
        label:
          (labelCounts.get(label) ?? 0) > 1 && parentLabel
            ? `${label} · ${parentLabel}`
            : label,
      };
    });
  }, [repoOptions]);

  const repoOptionLabelMap = useMemo(
    () => new Map(repoOptionsWithLabels.map((entry) => [entry.path, entry.label])),
    [repoOptionsWithLabels],
  );

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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-height: 560px)');
    const syncViewportMode = () => {
      setIsCompactViewport(mediaQuery.matches);
    };

    syncViewportMode();
    mediaQuery.addEventListener?.('change', syncViewportMode);
    return () => {
      mediaQuery.removeEventListener?.('change', syncViewportMode);
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

  function getRepoLabel(repoFullPath: string) {
    const trimmedPath = repoFullPath.trim();
    if (!trimmedPath) return '';
    const normalizedPath = trimmedPath.replace(/[\\/]+$/, '');
    const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
    return segments.at(-1) ?? normalizedPath;
  }

  function readStoredRepoPreferences(repoFullPath: string): StoredRepoPreferences | null {
    if (typeof window === 'undefined') return null;
    const normalizedPath = repoFullPath.trim();
    if (!normalizedPath) return null;

    try {
      const rawValue = window.localStorage.getItem(REPO_PREFERENCES_STORAGE_KEY);
      if (!rawValue) return null;
      const parsed = JSON.parse(rawValue) as Record<string, StoredRepoPreferences>;
      return parsed[normalizedPath] ?? null;
    } catch {
      return null;
    }
  }

  function writeStoredRepoPreferences(repoFullPath: string, preferences: StoredRepoPreferences) {
    if (typeof window === 'undefined') return;
    const normalizedPath = repoFullPath.trim();
    if (!normalizedPath) return;

    try {
      const rawValue = window.localStorage.getItem(REPO_PREFERENCES_STORAGE_KEY);
      const parsed = rawValue ? (JSON.parse(rawValue) as Record<string, StoredRepoPreferences>) : {};
      parsed[normalizedPath] = preferences;
      window.localStorage.setItem(REPO_PREFERENCES_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // Ignore localStorage failures and keep the UI functional.
    }
  }

  function applyRepoPreferences(repoFullPath: string) {
    const storedPreferences = readStoredRepoPreferences(repoFullPath);
    const fallbackProvider = providers[0];
    const nextProvider =
      providers.find((provider) => provider.id === storedPreferences?.providerId) ?? fallbackProvider;
    const nextModel =
      nextProvider.models.find((model) => model.id === storedPreferences?.modelId) ?? nextProvider.models[0];
    const nextReasoningEffort =
      nextModel.reasoningEfforts?.includes(storedPreferences?.reasoningEffort as ReasoningEffort)
        ? (storedPreferences?.reasoningEffort ?? '')
        : (nextModel.reasoningEfforts?.[0] ?? '');
    const nextMode = storedPreferences?.mode === 'worktree' ? 'worktree' : 'local';

    setProviderId(nextProvider.id);
    setModelId(nextModel?.id ?? '');
    setReasoningEffort(nextReasoningEffort);
    setMode(nextMode);
  }

  function resolvePreferredBranch(
    repoFullPath: string,
    nextBranches: BranchOption[],
    currentBranch: string | null | undefined,
  ) {
    const storedPreferences = readStoredRepoPreferences(repoFullPath);
    const savedBranch = storedPreferences?.selectedBranch?.trim();
    if (savedBranch && nextBranches.some((branch) => branch.name === savedBranch)) {
      return savedBranch;
    }
    if (currentBranch?.trim()) {
      return currentBranch.trim();
    }
    return nextBranches[0]?.name ?? '';
  }

  useEffect(() => {
    if (!repoPath.trim()) return;
    const existingPreferences = readStoredRepoPreferences(repoPath);
    writeStoredRepoPreferences(repoPath, {
      providerId,
      modelId,
      reasoningEffort: availableReasoning.length > 0 ? reasoningEffort : '',
      mode,
      selectedBranch: selectedBranch.trim() ? selectedBranch : existingPreferences?.selectedBranch,
    });
  }, [availableReasoning.length, modelId, mode, providerId, reasoningEffort, repoPath, selectedBranch]);

  useEffect(() => {
    if (hasInitializedRepoSelection.current) {
      return;
    }
    hasInitializedRepoSelection.current = true;

    const lastSelectedRepoPath = getMostRecentRepoPath(initialRecentRepoPaths);
    if (!lastSelectedRepoPath) {
      return;
    }

    setRepoPath(lastSelectedRepoPath);
    applyRepoPreferences(lastSelectedRepoPath);
    void loadBranches(lastSelectedRepoPath);
  }, [initialRecentRepoPaths]);

  async function loadBranches(pathOverride?: string) {
    const nextRepoPath = pathOverride?.trim() || repoPath.trim();
    if (!nextRepoPath) return;
    setLoadingBranches(true);
    setError(null);

    try {
      const response = await fetch(`/api/git/branches?path=${encodeURIComponent(nextRepoPath)}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load branches.');
      }

      setRepoPath(payload.path);
      applyRepoPreferences(payload.path);
      const nextBranches = payload.branches ?? [];
      setBranches(nextBranches);
      setSelectedBranch(resolvePreferredBranch(payload.path, nextBranches, payload.currentBranch));
      setRecentRepoPaths(Array.isArray(payload.recentRepoPaths) ? payload.recentRepoPaths : recentRepoPaths);
    } catch (loadError) {
      setBranches([]);
      setSelectedBranch('');
      setError(loadError instanceof Error ? loadError.message : 'Failed to load branches.');
    } finally {
      setLoadingBranches(false);
    }
  }

  async function browseForRepository() {
    setBrowsingFolder(true);
    setError(null);

    try {
      const response = await fetch('/api/fs/pick-directory', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to open the native folder picker.');
      }

      if (!payload.path) {
        return;
      }

      setBranches([]);
      setSelectedBranch('');
      await loadBranches(payload.path);
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : 'Failed to browse for a folder.');
    } finally {
      setBrowsingFolder(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourcePath: repoPath,
          mode,
          provider: providerId,
          model: modelId,
          reasoningEffort: availableReasoning.length > 0 ? reasoningEffort || null : null,
          selectedBranch,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create task.');
      }

      router.push(`/task/${encodeURIComponent(payload.taskId)}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create task.');
      setSubmitting(false);
    }
  }

  function renderBranchSelect() {
    return (
      <Select
        className="w-full"
        selectedKey={selectedBranch || undefined}
        onSelectionChange={(key) => setSelectedBranch(String(key))}
        isDisabled={!branches.length || submitting}
        placeholder={branches.length === 0 ? 'Load branches first' : 'Select branch'}
        variant="secondary"
      >
        <Label>Branch</Label>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {branches.map((branch) => (
              <ListBox.Item key={branch.name} id={branch.name} textValue={branch.name}>
                {branch.current ? `${branch.name} (current)` : branch.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  function renderProviderSelect() {
    return (
      <Select
        className="w-full"
        selectedKey={providerId}
        onSelectionChange={(key) => {
          const nextProvider = String(key) as ProviderId;
          const provider = providers.find((entry) => entry.id === nextProvider) ?? providers[0];
          setProviderId(nextProvider);
          setModelId(provider.models[0]?.id ?? '');
          setReasoningEffort(provider.models[0]?.reasoningEfforts?.[0] ?? '');
        }}
        variant="secondary"
      >
        <Label>Provider</Label>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {providers.map((provider) => (
              <ListBox.Item key={provider.id} id={provider.id} textValue={provider.label}>
                {provider.label}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  function renderModelSelect() {
    return (
      <Select
        className="w-full"
        selectedKey={modelId}
        onSelectionChange={(key) => {
          const nextModelId = String(key);
          setModelId(nextModelId);
          const nextModel = selectedProvider.models.find((model) => model.id === nextModelId);
          setReasoningEffort(nextModel?.reasoningEfforts?.[0] ?? '');
        }}
        variant="secondary"
      >
        <Label>Model</Label>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {selectedProvider.models.map((model) => (
              <ListBox.Item key={model.id} id={model.id} textValue={model.label}>
                {model.label}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  function renderReasoningSelect() {
    return (
      <Select
        className="w-full"
        selectedKey={availableReasoning.length > 0 ? reasoningEffort || undefined : undefined}
        onSelectionChange={(key) => setReasoningEffort(String(key) as ReasoningEffort)}
        isDisabled={availableReasoning.length === 0}
        placeholder={availableReasoning.length === 0 ? 'Provider default' : 'Select effort'}
        variant="secondary"
      >
        <Label>Reasoning effort</Label>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {availableReasoning.map((value) => (
              <ListBox.Item key={value} id={value} textValue={value}>
                {value}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  return (
    <main
      data-theme={theme}
      className="home-shell home-main min-h-screen px-4 py-6 transition-colors duration-200 sm:px-6"
    >
      <div className="home-frame mx-auto w-full max-w-5xl">
        <Card className="home-card home-root-card border border-default-200/70 backdrop-blur-xl" variant="default">
          <Card.Header className="home-header flex flex-col items-start gap-4 px-6 pb-2 pt-6 sm:flex-row sm:items-start sm:justify-between sm:px-8">
            <div className="home-hero flex flex-col gap-3">
              <h1 className="home-title text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
                🦫 Beaver
              </h1>
              <p className="home-intro max-w-3xl text-sm leading-7 text-muted">
                Start a coding task in a local branch or isolated worktree, open it in a tmux-backed terminal,
                and let the browser tab own the task lifecycle.
              </p>
            </div>
            <Button variant="ghost" onPress={() => router.push('/tasks')}>
              View tasks
            </Button>
          </Card.Header>

          <Separator />

          <Card.Content className="home-content px-6 py-6 sm:px-8">
            <form className="home-form flex flex-col gap-6" onSubmit={handleSubmit}>
              <div className="home-layout-grid grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <div className="home-primary-panel flex flex-col gap-6">
                  <div className="home-repo-block flex flex-col gap-3">
                    <Label htmlFor="repo-path" className="text-sm font-medium text-foreground">Repository path</Label>
                    <div className="home-repo-row grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Select
                        className="w-full"
                        selectedKey={repoPath || undefined}
                        onSelectionChange={(key) => {
                          const nextRepoPath = String(key);
                          setRepoPath(nextRepoPath);
                          applyRepoPreferences(nextRepoPath);
                          setBranches([]);
                          setSelectedBranch('');
                          void loadBranches(nextRepoPath);
                        }}
                        isDisabled={submitting || (repoOptions.length === 0 && !repoPath)}
                        placeholder={repoOptions.length === 0 ? 'Browse to choose a repository folder' : 'Choose a recent repository'}
                        variant="secondary"
                        aria-label="Repository path"
                      >
                        <Select.Trigger id="repo-path">
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {repoOptions.map((option) => (
                              <ListBox.Item
                                key={option}
                                id={option}
                                textValue={repoOptionLabelMap.get(option) ?? option}
                              >
                                {isCompactViewport ? (
                                  <div className="min-w-0" title={option}>
                                    <span className="block truncate">
                                      {repoOptionLabelMap.get(option) ?? getRepoLabel(option)}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex min-w-0 flex-col" title={option}>
                                    <span className="block truncate">{getRepoLabel(option)}</span>
                                    <span className="block truncate text-xs text-muted">{option}</span>
                                  </div>
                                )}
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        onPress={() => void browseForRepository()}
                        isDisabled={browsingFolder || loadingBranches || submitting}
                      >
                        {browsingFolder ? (
                          <Spinner size="sm" />
                        ) : (
                          <span className="flex items-center gap-2">
                            <FolderArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                            <span>Browse</span>
                          </span>
                        )}
                      </Button>
                    </div>
                    <p className="home-support-text text-sm leading-6 text-muted">
                      Choose a recent repository or browse for a folder. Beaver keeps the 10 most recent valid repository paths.
                    </p>
                  </div>

                  <div className="home-controls-grid grid gap-5 md:grid-cols-2">
                    {renderBranchSelect()}
                    {renderProviderSelect()}
                    <div className="home-model-block flex flex-col gap-2">
                      {renderModelSelect()}
                      <p className="home-model-description text-sm leading-6 text-muted">{selectedModel?.description}</p>
                    </div>
                    {renderReasoningSelect()}
                  </div>
                </div>

                {isCompactViewport ? (
                  <section className="home-mode-compact" aria-labelledby="workspace-mode-label">
                    <div className="home-mode-compact-header">
                      <div className="home-mode-compact-copy">
                        <h2 id="workspace-mode-label" className="home-mode-compact-title">Workspace mode</h2>
                        <p className="home-mode-compact-description">Use the repo directly or launch an isolated worktree.</p>
                      </div>
                      <ButtonGroup
                        size="sm"
                        variant="secondary"
                        className="home-mode-compact-switch"
                        aria-label="Workspace mode"
                      >
                        <Button
                          type="button"
                          variant={mode === 'local' ? 'primary' : 'secondary'}
                          onPress={() => setMode('local')}
                          className="home-mode-compact-button"
                        >
                          <span className="flex items-center gap-2">
                            <Terminal aria-hidden="true" className="h-4 w-4 shrink-0" />
                            <span>Local</span>
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant={mode === 'worktree' ? 'primary' : 'secondary'}
                          onPress={() => setMode('worktree')}
                          className="home-mode-compact-button"
                        >
                          <span className="flex items-center gap-2">
                            <CodeFork aria-hidden="true" className="h-4 w-4 shrink-0" />
                            <span>Worktree</span>
                          </span>
                        </Button>
                      </ButtonGroup>
                    </div>
                    <p className="home-mode-compact-summary text-sm leading-6 text-muted">
                      {mode === 'worktree'
                        ? 'Creates a disposable bever/<taskId> branch inside a dedicated .bever worktree.'
                        : 'Reuses the selected repository and checks out the chosen branch when the worktree is clean.'}
                    </p>
                  </section>
                ) : (
                  <Card variant="secondary" className="home-mode-card home-subcard border border-default-200/70">
                    <Card.Header className="home-mode-header flex flex-col items-start gap-2 px-5 pb-2 pt-5">
                      <Card.Title className="text-lg font-medium">Workspace mode</Card.Title>
                      <Card.Description className="home-mode-description text-sm leading-6 text-muted">
                        Choose whether Beaver reuses the repository directly or creates an isolated worktree.
                      </Card.Description>
                    </Card.Header>
                    <Card.Content className="home-mode-content px-5 pb-5">
                      <Tabs
                        selectedKey={mode}
                        onSelectionChange={(key) => setMode(String(key) as TaskMode)}
                        variant="secondary"
                        className="home-mode-tabs w-full"
                      >
                        <Tabs.ListContainer>
                          <Tabs.List aria-label="Workspace mode">
                            <Tabs.Tab id="local">
                              <Tabs.Indicator />
                              Local
                            </Tabs.Tab>
                            <Tabs.Tab id="worktree">
                              <Tabs.Separator />
                              <Tabs.Indicator />
                              Worktree
                            </Tabs.Tab>
                          </Tabs.List>
                        </Tabs.ListContainer>
                        <Tabs.Panel id="local" className="home-mode-panel pt-4 text-sm leading-6 text-muted">
                          Reuse the selected repository and checkout the chosen branch if the worktree is clean.
                        </Tabs.Panel>
                        <Tabs.Panel id="worktree" className="home-mode-panel pt-4 text-sm leading-6 text-muted">
                          Create a new <span className="font-medium text-foreground">bever/&lt;taskId&gt;</span> branch under a
                          dedicated <span className="font-medium text-foreground">.bever</span> worktree.
                        </Tabs.Panel>
                      </Tabs>
                    </Card.Content>
                  </Card>
                )}
              </div>

              {error ? (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Title>Could not prepare the task</Alert.Title>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              <div className="home-footer flex flex-col gap-4 border-t border-default-200/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="home-footer-copy text-sm leading-6 text-muted">
                  {mode === 'worktree'
                    ? 'Worktree mode creates a disposable branch and workspace for the task.'
                    : 'Local mode keeps the task inside the selected repository root.'}
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={submitting || !repoPath.trim() || !selectedBranch || !modelId}
                  className="home-start-button min-w-40"
                >
                  {submitting ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <Play aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span>Start task</span>
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </Card.Content>
        </Card>
      </div>
    </main>
  );
}
