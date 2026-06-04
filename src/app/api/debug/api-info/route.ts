import { NextRequest, NextResponse } from 'next/server';
import { getActiveApiKey } from '@/lib/admin';

export async function GET(req: NextRequest) {
  try {
    const key = await getActiveApiKey();
    if (!key) {
      return NextResponse.json({ source: 'fallback', key: null });
    }
    return NextResponse.json({ 
      source: 'database', 
      name: key.name, 
      baseUrl: key.baseUrl,
      hasKey: !!key.apiKey,
      keyPrefix: key.apiKey?.substring(0, 20) + '...',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
