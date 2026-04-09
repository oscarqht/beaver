import test from 'node:test';
import assert from 'node:assert/strict';
import { getPickDirectoryCommand, getPickFilesCommand } from '../lib/native-dialog';

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

test('native multi-file dialog command uses osascript on macOS', () => {
  const command = getPickFilesCommand('darwin');
  assert.equal(command.command, 'osascript');
  assert.match(command.args.join(' '), /choose file with prompt "Choose files to insert into terminal" with multiple selections allowed/);
  assert.match(command.args.join(' '), /POSIX path of chosenFile/);
});

test('native multi-file dialog command uses powershell on Windows', () => {
  const command = getPickFilesCommand('win32');
  assert.equal(command.command, 'powershell');
  assert.match(command.args.join(' '), /OpenFileDialog/);
  assert.match(command.args.join(' '), /Multiselect = \$true/);
});

test('native multi-file dialog command uses zenity on Linux', () => {
  const command = getPickFilesCommand('linux');
  assert.equal(command.command, 'zenity');
  assert.deepEqual(command.args, [
    '--file-selection',
    '--multiple',
    '--separator=\n',
    '--title=Choose files to insert into terminal',
  ]);
});
