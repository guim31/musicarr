import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/apiError';
import { DeemixService } from '@/services/DeemixService';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const plan = await DeemixService.getAlbumOrganizationPlan(id);
    return NextResponse.json({ success: true, plan });
  } catch (error: any) {
    console.error('Rename Plan API Error:', error);
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const success = await DeemixService.renameAlbumContents(id);
    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('Rename API Error:', error);
    return errorResponse(error);
  }
}
