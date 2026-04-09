import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type CommandSpec = {
  command: string;
  args: string[];
};

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
