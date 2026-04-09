import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTerminalUrl, makeTmuxSessionName } from '../lib/terminal';

test('builds stable tmux session names and ttyd urls', () => {
  const sessionName = makeTmuxSessionName('task-1234567890', 'terminal-abcdef');
  assert.match(sessionName, /^bever-task-1234567890-terminal-abc/);

  const url = buildTerminalUrl(sessionName);
  assert.match(url, /127\.0\.0\.1:7681/);
  assert.match(url, /new-session/);
  assert.match(url, /-A/);
  assert.match(url, /-s/);
});
