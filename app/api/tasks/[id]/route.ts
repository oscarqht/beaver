import { NextResponse } from 'next/server';
import { deleteTask, getTaskDetails, sweepStaleTasks } from '../../../../lib/task-service';

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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const details = await getTaskDetails(id);
  if (!details) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  try {
    await deleteTask(id);
    return NextResponse.json({ deletedTaskId: id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
