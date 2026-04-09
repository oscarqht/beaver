export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type TaskMode = 'local' | 'worktree';
export type TaskStatus = 'pending' | 'active' | 'cleaning';
export type ProviderId = 'codex' | 'gemini' | 'cursor';
export type TerminalRole = 'main' | 'shell';

export type ProviderModel = {
  id: string;
  label: string;
  description: string;
  reasoningEfforts?: ReasoningEffort[];
};

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  models: ProviderModel[];
  buildCommand(input: {
    model: string;
    reasoningEffort?: ReasoningEffort | null;
  }): string;
};

export type TaskRecord = {
  id: string;
  sourcePath: string;
  workspacePath: string;
  mode: TaskMode;
  provider: ProviderId;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  selectedBranch: string;
  worktreeBranch: string | null;
  status: TaskStatus;
  ownerClientId: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
};

export type TerminalRecord = {
  id: string;
  taskId: string;
  role: TerminalRole;
  title: string;
  tmuxSessionName: string;
  closable: boolean;
  createdAt: string;
};

export type BeverState = {
  version: 1;
  tasks: Record<string, TaskRecord>;
  terminals: Record<string, TerminalRecord>;
  recentRepoPaths: string[];
};

export type BranchOption = {
  name: string;
  current: boolean;
};
