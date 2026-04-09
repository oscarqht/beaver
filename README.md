# Beaver

Beaver is a minimal local task launcher for coding agents. It gives you a browser UI for opening a Git repository, choosing a branch, selecting an agent CLI and model, and launching the task inside a tmux-backed terminal workspace.

The app is built with Next.js and stores its own state on disk, so it works as a lightweight local control panel rather than a hosted task service.

## What It Does

- Launches coding-agent tasks from a local Git repository.
- Supports `local` mode and disposable `worktree` mode.
- Starts the selected provider CLI inside a dedicated tmux session.
- Exposes terminals in the browser through `ttyd`.
- Lets you open extra shell tabs for the same task.
- Persists recent repositories and task state in `~/.bever` by default.
- Keeps tasks running until you end them manually.

## Supported Providers

Beaver currently knows how to launch:

- `codex`
- `gemini`
- `cursor`

The UI exposes a fixed model catalog for each provider. The actual CLI binaries must already be installed on your machine.

## Requirements

Install these before running Beaver:

- Node.js
- npm
- `git`
- `tmux`
- `ttyd`

You also need at least one supported provider CLI available on `PATH`, unless you point Beaver at a custom binary path with environment variables.

Optional platform-specific dependency for the "pick directory" button:

- macOS: `osascript` (normally built in)
- Linux: `zenity`
- Windows: `powershell`

## Installation

```bash
npm install
```

## Running Locally

Start the dev server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Useful scripts:

- `npm run dev` starts the Next.js dev server
- `npm run build` builds the production app
- `npm run start` runs the production server
- `npm test` runs the test suite with `tsx --test`

## Typical Workflow

1. Open Beaver in the browser.
2. Select or paste a local repository path.
3. Load branches from that repository.
4. Choose a branch, provider, model, and task mode.
5. Create the task and open it.
6. Beaver boots the workspace, starts `ttyd`, creates a tmux session, and launches the selected CLI.
7. Add extra shell tabs if you need supporting commands alongside the main agent terminal.
8. End the task from the task page when you are done.

## Task Modes

### `local`

`local` mode runs directly in the original repository.

- Beaver checks out the selected branch in the source repo.
- The repo must be clean before Beaver switches branches.
- The task workspace path is the repository itself.

Use this when you intentionally want the agent to work in the original checkout.

### `worktree`

`worktree` mode creates an isolated Git worktree for the task.

- Beaver creates a new branch named `bever/<task-id>`.
- The worktree is created under a sibling `.bever` directory next to the source repo.
- On cleanup, Beaver removes the worktree and deletes the temporary branch.

For a repo at `/path/to/my-repo`, Beaver creates worktrees like:

```text
/path/to/.bever/my-repo/<task-id>
```

Use this when you want task isolation and easy cleanup.

## Runtime Behavior

- Each task can stay open in multiple browser tabs at the same time while those tabs keep heartbeating.
- The task page sends a heartbeat every 15 seconds.
- If a task page stops heartbeating for 30 seconds, Beaver releases that page's browser ownership so the running task can be reconnected later.
- The main terminal tab cannot be closed.
- Extra shell tabs can be created, renamed, and closed.

## State and Files

By default Beaver stores state in:

```text
~/.bever/state.json
```

It also caches a patched `ttyd` index at:

```text
~/.bever/ttyd/index.html
```

Recent repositories are stored in the same state file.

## Environment Variables

Beaver supports a small set of runtime overrides:

- `BEVER_HOME_DIR`: override the default state directory
- `BEVER_CODEX_BIN`: path or command name for the Codex CLI
- `BEVER_GEMINI_BIN`: path or command name for the Gemini CLI
- `BEVER_CURSOR_BIN`: path or command name for the Cursor Agent CLI
- `SHELL`: shell used for tmux sessions, defaults to `/bin/zsh`

## Provider Launch Details

Beaver does not embed any agent runtime itself. It shells out to the configured provider CLI.

Current command behavior:

- Codex: launches with `approval_policy="never"` and `sandbox_mode="danger-full-access"`
- Gemini: launches with `--yolo`
- Cursor: launches with `--model <model>` when a model is selected

If those defaults are too opinionated for your setup, adjust the provider config in [`lib/provider-config.ts`](/Users/tangqh/Downloads/projects/beaver/lib/provider-config.ts).

## API Surface

The local UI is backed by Next.js route handlers under [`app/api`](/Users/tangqh/Downloads/projects/beaver/app/api):

- `GET /api/git/branches`: validate a repo path and list local branches
- `POST /api/fs/pick-directory`: open a native folder picker
- `GET /api/tasks`: list tasks
- `POST /api/tasks`: create a task
- `DELETE /api/tasks`: delete all tasks
- `GET /api/tasks/:id`: get task details
- `DELETE /api/tasks/:id`: delete a task
- `POST /api/tasks/:id/bootstrap`: claim and start a task
- `POST /api/tasks/:id/heartbeat`: refresh task ownership
- `POST /api/tasks/:id/release`: release one page's task ownership without ending the task
- `POST /api/tasks/:id/cleanup`: end a task
- `POST /api/tasks/:id/terminals`: open an extra shell tab
- `PATCH /api/tasks/:id/terminals/:terminalId`: rename a terminal
- `DELETE /api/tasks/:id/terminals/:terminalId`: close an extra terminal

## Development Notes

- The app uses Next.js App Router.
- Task state is file-backed, not database-backed.
- tmux sessions are exposed through a shared `ttyd` instance on port `7681`.
- Beaver patches the `ttyd` index HTML to suppress terminal scrollbars and resize overlays.

Key implementation files:

- [`lib/task-service.ts`](/Users/tangqh/Downloads/projects/beaver/lib/task-service.ts)
- [`lib/terminal.ts`](/Users/tangqh/Downloads/projects/beaver/lib/terminal.ts)
- [`lib/git.ts`](/Users/tangqh/Downloads/projects/beaver/lib/git.ts)
- [`lib/store.ts`](/Users/tangqh/Downloads/projects/beaver/lib/store.ts)
- [`components/HomePageClient.tsx`](/Users/tangqh/Downloads/projects/beaver/components/HomePageClient.tsx)
- [`components/TaskPageClient.tsx`](/Users/tangqh/Downloads/projects/beaver/components/TaskPageClient.tsx)

## Testing

Run:

```bash
npm test
```

The current tests cover store behavior, task routes, task cleanup helpers, terminal rename behavior, provider configuration, and Git helpers.
