import { NextResponse } from 'next/server';
import { cleanupTask } from '../../../../../lib/task-service';
import { readJsonBody } from '../../../../../lib/request';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const body = await readJsonBody<{ clientId?: string }>(request);
    const clientId = body.clientId?.trim();
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
    }

    await cleanupTask(id, { clientId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
