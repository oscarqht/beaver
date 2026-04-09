import { NextResponse } from 'next/server';
import { bootstrapTask } from '../../../../../lib/task-service';
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

    const payload = await bootstrapTask(id, clientId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('another browser tab') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
