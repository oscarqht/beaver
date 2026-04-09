export function getMostRecentRepoPath(recentRepoPaths: string[]): string {
  for (const repoPath of recentRepoPaths) {
    const normalizedPath = repoPath.trim();
    if (normalizedPath) {
      return normalizedPath;
    }
  }

  return '';
}
