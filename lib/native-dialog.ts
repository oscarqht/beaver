import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type CommandSpec = {
  command: string;
  args: string[];
};

function parseSelectedPaths(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((value) => value.replace(/\r$/, ''))
    .filter(Boolean);
}

export function getPickDirectoryCommand(platform = os.platform()): CommandSpec {
  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: [
        '-e',
        'set chosenFolder to choose folder with prompt "Choose a repository folder"',
        '-e',
        'POSIX path of chosenFolder',
      ],
    };
  }

  if (platform === 'win32') {
    return {
      command: 'powershell',
      args: [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "Choose a repository folder"; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
      ],
    };
  }

  return {
    command: 'zenity',
    args: ['--file-selection', '--directory', '--title=Choose a repository folder'],
  };
}

export function getPickFilesCommand(platform = os.platform()): CommandSpec {
  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: [
        '-e',
        'set chosenFiles to choose file with prompt "Choose files to insert into terminal" with multiple selections allowed',
        '-e',
        'set output to ""',
        '-e',
        'repeat with chosenFile in chosenFiles',
        '-e',
        'set output to output & POSIX path of chosenFile & linefeed',
        '-e',
        'end repeat',
        '-e',
        'output',
      ],
    };
  }

  if (platform === 'win32') {
    return {
      command: 'powershell',
      args: [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = "Choose files to insert into terminal"; $dialog.Multiselect = $true; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.FileNames | ForEach-Object { Write-Output $_ } }',
      ],
    };
  }

  return {
    command: 'zenity',
    args: ['--file-selection', '--multiple', '--separator=\n', '--title=Choose files to insert into terminal'],
  };
}

export async function pickDirectory(): Promise<string | null> {
  const { command, args } = getPickDirectoryCommand();
  try {
    const { stdout } = await execFileAsync(command, args);
    const selectedPath = stdout.trim();
    return selectedPath || null;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { code?: string | number };
    if (String(execError.code) === '1') {
      return null;
    }
    throw error;
  }
}

export async function pickFiles(): Promise<string[] | null> {
  const { command, args } = getPickFilesCommand();
  try {
    const { stdout } = await execFileAsync(command, args);
    const selectedPaths = parseSelectedPaths(stdout);
    return selectedPaths.length > 0 ? selectedPaths : null;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { code?: string | number };
    if (String(execError.code) === '1') {
      return null;
    }
    throw error;
  }
}
