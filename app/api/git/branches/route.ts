import { NextRequest, NextResponse } from 'next/server';
import { listLocalBranches, resolveGitRepositoryPath } from '../../../../lib/git';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const repoPath = request.nextUrl.searchParams.get('path')?.trim() || '';
  if (!repoPath) {
    return NextResponse.json({ error: 'path is required.' }, { status: 400 });
  }

  try {
    const resolvedPath = await resolveGitRepositoryPath(repoPath);
    const result = await listLocalBranches(resolvedPath);
    return NextResponse.json({
      path: resolvedPath,
      currentBranch: result.currentBranch,
      branches: result.branches,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
