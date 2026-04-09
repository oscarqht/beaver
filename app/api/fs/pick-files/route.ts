import { NextResponse } from 'next/server';
import { pickFiles } from '../../../../lib/native-dialog';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const selectedPaths = await pickFiles();
    return NextResponse.json({ paths: selectedPaths ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
