import { NextResponse } from 'next/server';
import { logger } from '@/lib/LogService';

export async function GET() {
  try {
    const logs = logger.getLogs();
    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    logger.clearLogs();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
