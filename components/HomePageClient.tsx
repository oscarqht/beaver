'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BranchOption, ProviderId, ReasoningEffort, TaskMode } from '../lib/types';

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
};

export function HomePageClient({ providers }: HomePageClientProps) {
  const router = useRouter();
  const [repoPath, setRepoPath] = useState('');
  const [resolvedRepoPath, setResolvedRepoPath] = useState('');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [mode, setMode] = useState<TaskMode>('local');
  const [providerId, setProviderId] = useState<ProviderId>('codex');
  const [modelId, setModelId] = useState(providers[0]?.models[0]?.id ?? '');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | ''>('low');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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

  async function loadBranches() {
    if (!repoPath.trim()) return;
    setLoadingBranches(true);
    setError(null);
    setStatus('Resolving repository and loading branches...');

    try {
      const response = await fetch(`/api/git/branches?path=${encodeURIComponent(repoPath.trim())}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load branches.');
      }

      setResolvedRepoPath(payload.path);
      setBranches(payload.branches ?? []);
      setSelectedBranch(payload.currentBranch ?? payload.branches?.[0]?.name ?? '');
      setStatus(`Loaded ${payload.branches?.length ?? 0} local branches.`);
    } catch (loadError) {
      setBranches([]);
      setSelectedBranch('');
      setResolvedRepoPath('');
      setError(loadError instanceof Error ? loadError.message : 'Failed to load branches.');
      setStatus(null);
    } finally {
      setLoadingBranches(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus('Creating task...');

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
      setStatus(null);
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <div className="container">
        <section className="card home-card">
          <div className="eyebrow">Local-only task launcher</div>
          <div className="hero">
            <div>
              <h1>Bever</h1>
              <p>
                Start a coding task in a local branch or isolated worktree, open it in a tmux-backed terminal,
                and let the browser tab own the task lifecycle.
              </p>
            </div>

            <form className="task-grid" onSubmit={handleSubmit}>
              <div className="field-grid">
                <div className="field full">
                  <label htmlFor="repo-path">Repository path</label>
                  <div className="inline-row">
                    <input
                      id="repo-path"
                      className="input"
                      placeholder="~/projects/my-repo"
                      value={repoPath}
                      onChange={(event) => setRepoPath(event.target.value)}
                      onBlur={() => {
                        if (!branches.length) {
                          void loadBranches();
                        }
                      }}
                    />
                    <button
                      className="button"
                      type="button"
                      onClick={() => void loadBranches()}
                      disabled={loadingBranches || submitting || !repoPath.trim()}
                    >
                      {loadingBranches ? 'Loading...' : 'Load branches'}
                    </button>
                  </div>
                  <p className="help-text">
                    Enter a real local Git repository path. Browser folder handles are not usable for server-side shell work.
                  </p>
                  {resolvedRepoPath ? <p className="muted-text">Resolved repo: {resolvedRepoPath}</p> : null}
                </div>

                <div className="field">
                  <label htmlFor="branch">Branch</label>
                  <select
                    id="branch"
                    className="select"
                    value={selectedBranch}
                    onChange={(event) => setSelectedBranch(event.target.value)}
                    disabled={!branches.length || submitting}
                  >
                    {branches.length === 0 ? <option value="">Load branches first</option> : null}
                    {branches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.current ? `${branch.name} (current)` : branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Workspace mode</label>
                  <div className="toggle">
                    <button
                      type="button"
                      className={mode === 'local' ? 'active' : ''}
                      onClick={() => setMode('local')}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      className={mode === 'worktree' ? 'active' : ''}
                      onClick={() => setMode('worktree')}
                    >
                      Worktree
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="provider">Provider</label>
                  <select
                    id="provider"
                    className="select"
                    value={providerId}
                    onChange={(event) => {
                      const nextProvider = event.target.value as ProviderId;
                      const provider = providers.find((entry) => entry.id === nextProvider) ?? providers[0];
                      setProviderId(nextProvider);
                      setModelId(provider.models[0]?.id ?? '');
                      const defaultReasoning = provider.models[0]?.reasoningEfforts?.[0] ?? '';
                      setReasoningEffort(defaultReasoning);
                    }}
                  >
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="model">Model</label>
                  <select
                    id="model"
                    className="select"
                    value={modelId}
                    onChange={(event) => {
                      const nextModelId = event.target.value;
                      setModelId(nextModelId);
                      const nextModel = selectedProvider.models.find((model) => model.id === nextModelId);
                      setReasoningEffort(nextModel?.reasoningEfforts?.[0] ?? '');
                    }}
                  >
                    {selectedProvider.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <p className="help-text">{selectedModel?.description}</p>
                </div>

                <div className="field">
                  <label htmlFor="reasoning">Reasoning effort</label>
                  <select
                    id="reasoning"
                    className="select"
                    value={availableReasoning.length > 0 ? reasoningEffort : ''}
                    onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
                    disabled={availableReasoning.length === 0}
                  >
                    {availableReasoning.length === 0 ? <option value="">Provider default</option> : null}
                    {availableReasoning.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error ? <div className="status error">{error}</div> : null}
              {status && !error ? <div className="status">{status}</div> : null}

              <div className="action-row">
                <button
                  className="button primary"
                  type="submit"
                  disabled={submitting || !repoPath.trim() || !selectedBranch || !modelId}
                >
                  {submitting ? 'Starting...' : 'Start task'}
                </button>
                <p className="help-text">
                  {mode === 'worktree'
                    ? 'Worktree mode creates a new bever/<taskId> branch under .bever.'
                    : 'Local mode reuses the selected repository and may checkout the chosen branch.'}
                </p>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
