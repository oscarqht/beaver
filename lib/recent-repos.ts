export function getMostRecentRepoPath(recentRepoPaths: string[]): string {
  for (const repoPath of recentRepoPaths) {
    const normalizedPath = repoPath.trim();
    if (normalizedPath) {
      return normalizedPath;
    }
  }

  return '';
}

export function getPreferredRepoPath(recentRepoPaths: string[], lastSelectedRepoPath?: string | null): string {
  const normalizedLastSelectedRepoPath = lastSelectedRepoPath?.trim();
  if (normalizedLastSelectedRepoPath) {
    return normalizedLastSelectedRepoPath;
  }

  return getMostRecentRepoPath(recentRepoPaths);
}
