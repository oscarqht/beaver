import { NextResponse } from 'next/server';
import { getTaskDetails, sweepStaleTasks } from '../../../../lib/task-service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await sweepStaleTasks();
  const { id } = await context.params;
  const details = await getTaskDetails(id);
  if (!details) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }
  return NextResponse.json(details);
}
