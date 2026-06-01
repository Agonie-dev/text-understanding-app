import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAppConfig } from '@/lib/quota';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response!;

  try {
    const config = await getAppConfig();
    return NextResponse.json({
      daily_summary_limit: config.daily_summary_limit,
      daily_qa_rounds: config.daily_qa_rounds,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response!;

  try {
    const { daily_summary_limit, daily_qa_rounds, admin_password } = await req.json();

    const updates: Record<string, any> = {};
    if (typeof daily_summary_limit === 'number') updates.daily_summary_limit = Math.max(1, daily_summary_limit);
    if (typeof daily_qa_rounds === 'number') updates.daily_qa_rounds = Math.max(1, daily_qa_rounds);
    if (admin_password && typeof admin_password === 'string' && admin_password.length >= 4) {
      const { hashPassword } = await import('@/lib/auth');
      updates.admin_password_hash = await hashPassword(admin_password);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '没有提供有效的更新字段' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('app_config').update(updates).eq('id', 1);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
