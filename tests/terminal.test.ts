import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTerminalUrl, makeTmuxSessionName, patchTtydIndexHtml } from '../lib/terminal';

test('builds stable tmux session names and ttyd urls', () => {
  const sessionName = makeTmuxSessionName('task-1234567890', 'terminal-abcdef');
  assert.match(sessionName, /^bever-task-1234567890-terminal-abc/);

  const url = buildTerminalUrl(sessionName);
  assert.match(url, /127\.0\.0\.1:7681/);
  assert.match(url, /new-session/);
  assert.match(url, /-A/);
  assert.match(url, /-s/);
});

test('patches ttyd html to hide xterm viewport overflow', () => {
  const html = '<html><head><style>.xterm .xterm-viewport{overflow-y:scroll}</style></head><body></body></html>';
  const patched = patchTtydIndexHtml(html);

  assert.match(patched, /beaver-ttyd-patch-v3/);
  assert.match(
    patched,
    /\.xterm \.xterm-viewport\{overflow:hidden!important;overflow-y:hidden!important;scrollbar-width:none!important;\}/,
  );
  assert.match(patched, /\.xterm \.xterm-viewport::-webkit-scrollbar\{display:none!important;width:0!important;height:0!important;\}/);
  assert.match(patched, /document\.querySelectorAll\('\.xterm-viewport'\)/);
  assert.match(patched, /beaver:insert-text/);
  assert.match(patched, /setRangeText/);
  assert.match(patched, /window\.setInterval\(apply,250\)/);
});
