import test from 'node:test';
import assert from 'node:assert/strict';
import { getPickDirectoryCommand } from '../lib/native-dialog';

test('native dialog command uses osascript on macOS', () => {
  const command = getPickDirectoryCommand('darwin');
  assert.equal(command.command, 'osascript');
  assert.deepEqual(command.args, [
    '-e',
    'set chosenFolder to choose folder with prompt "Choose a repository folder"',
    '-e',
    'POSIX path of chosenFolder',
  ]);
});

test('native dialog command uses powershell on Windows', () => {
  const command = getPickDirectoryCommand('win32');
  assert.equal(command.command, 'powershell');
  assert.match(command.args.join(' '), /FolderBrowserDialog/);
});

test('native dialog command uses zenity on Linux', () => {
  const command = getPickDirectoryCommand('linux');
  assert.equal(command.command, 'zenity');
  assert.deepEqual(command.args, ['--file-selection', '--directory', '--title=Choose a repository folder']);
});
