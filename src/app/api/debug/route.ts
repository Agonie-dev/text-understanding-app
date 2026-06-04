import { NextRequest, NextResponse } from 'next/server';
import { getAdminPasswordHash } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const hash = await getAdminPasswordHash();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'missing';
  return NextResponse.json({
    hasHash: !!hash,
    hashLength: hash?.length || 0,
    supabaseUrl: url,
  });
}
