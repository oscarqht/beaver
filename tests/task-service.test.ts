import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMainTerminalDuplicates } from '../lib/task-service';
import type { TerminalRecord } from '../lib/types';

test('splitMainTerminalDuplicates keeps the earliest main terminal and preserves shell tabs', () => {
  const terminals: TerminalRecord[] = [
    {
      id: 'main-1',
      taskId: 'task-1',
      role: 'main',
      title: 'Codex CLI main',
      tmuxSessionName: 'main-1',
      closable: false,
      createdAt: '2026-04-09T01:00:00.000Z',
    },
    {
      id: 'shell-1',
      taskId: 'task-1',
      role: 'shell',
      title: 'Shell 1',
      tmuxSessionName: 'shell-1',
      closable: true,
      createdAt: '2026-04-09T01:00:01.000Z',
    },
    {
      id: 'main-2',
      taskId: 'task-1',
      role: 'main',
      title: 'Codex CLI main',
      tmuxSessionName: 'main-2',
      closable: false,
      createdAt: '2026-04-09T01:00:02.000Z',
    },
  ];

  const result = splitMainTerminalDuplicates(terminals);

  assert.equal(result.primaryMainTerminal?.id, 'main-1');
  assert.deepEqual(
    result.duplicateMainTerminals.map((terminal) => terminal.id),
    ['main-2'],
  );
  assert.deepEqual(
    result.normalizedTerminals.map((terminal) => terminal.id),
    ['main-1', 'shell-1'],
  );
});
