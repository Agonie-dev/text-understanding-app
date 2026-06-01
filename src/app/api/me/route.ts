import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getVisitorQuota } from '@/lib/quota';

export async function GET(req: NextRequest) {
  try {
    const admin = await isAdmin(req);

    if (admin) {
      return NextResponse.json({ role: 'admin' });
    }

    // 游客：返回配额信息
    const visitorId = req.headers.get('x-visitor-id') || 'unknown';
    const quota = await getVisitorQuota(visitorId);

    return NextResponse.json({
      role: 'visitor',
      quota,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
