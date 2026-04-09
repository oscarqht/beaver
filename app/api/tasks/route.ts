import { NextResponse } from 'next/server';
import { createTask, sweepStaleTasks } from '../../../lib/task-service';
import { readJsonBody } from '../../../lib/request';
import type { ProviderId, ReasoningEffort, TaskMode } from '../../../lib/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  await sweepStaleTasks();

  try {
    const body = await readJsonBody<{
      sourcePath?: string;
      mode?: TaskMode;
      provider?: ProviderId;
      model?: string;
      reasoningEffort?: ReasoningEffort | null;
      selectedBranch?: string;
    }>(request);

    const task = await createTask({
      sourcePath: body.sourcePath ?? '',
      mode: body.mode ?? 'local',
      provider: body.provider ?? 'codex',
      model: body.model ?? '',
      reasoningEffort: body.reasoningEffort ?? null,
      selectedBranch: body.selectedBranch ?? '',
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
