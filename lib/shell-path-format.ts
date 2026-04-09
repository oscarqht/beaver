function quotePathForShell(filePath: string): string {
  return `'${filePath.replace(/'/g, `'\\''`)}'`;
}

export function formatPathsForTerminalInput(paths: string[]): string {
  return paths.map((filePath) => quotePathForShell(filePath)).join(' ');
}
