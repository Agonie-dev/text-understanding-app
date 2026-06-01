import { NextRequest, NextResponse } from 'next/server';
import { loginAdmin, setAdminCookie, clearAdminCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '请提供密码' }, { status: 400 });
    }

    const result = await loginAdmin(password);
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, role: 'admin' });
    res.headers.set('Set-Cookie', setAdminCookie(result.token));
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  res.headers.set('Set-Cookie', clearAdminCookie());
  return res;
}
