import { NextResponse } from 'next/server';
import { pickDirectory } from '../../../../lib/native-dialog';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const selectedPath = await pickDirectory();
    return NextResponse.json({ path: selectedPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
