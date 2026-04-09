import { NextResponse } from 'next/server';
import { removeTerminal, renameTerminal } from '../../../../../../lib/task-service';
import { readJsonBody } from '../../../../../../lib/request';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; terminalId: string }> },
) {
  const { id, terminalId } = await context.params;

  try {
    const body = await readJsonBody<{ clientId?: string }>(request);
    const clientId = body.clientId?.trim();
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
    }

    await removeTerminal(id, terminalId, clientId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; terminalId: string }> },
) {
  const { id, terminalId } = await context.params;

  try {
    const body = await readJsonBody<{ clientId?: string; title?: string }>(request);
    const clientId = body.clientId?.trim();
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
    }

    const terminal = await renameTerminal(id, terminalId, clientId, body.title ?? '');
    return NextResponse.json({ terminal });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
