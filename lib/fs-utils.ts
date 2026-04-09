import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function resolveBeverHomeDir(): string {
  const configured = process.env.BEVER_HOME_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), '.bever');
}

export function expandUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2));
  return path.resolve(trimmed);
}

export async function ensureDirectory(directoryPath: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });
}
