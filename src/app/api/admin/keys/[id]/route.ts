import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response!;

  try {
    const { id } = await params;
    const { error } = await supabase.from('api_keys').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response!;

  try {
    const { id } = await params;
    const { name, api_key, base_url, is_active, is_default } = await req.json();

    const updates: Record<string, any> = {};
    if (name) updates.name = name;
    if (api_key) updates.api_key = encrypt(api_key);
    if (base_url) updates.base_url = base_url;
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (typeof is_default === 'boolean') updates.is_default = is_default;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '没有提供有效的更新字段' }, { status: 400 });
    }

    if (typeof is_default === 'boolean' && is_default) {
      await supabase.from('api_keys').update({ is_default: false }).neq('id', id);
    }

    const { error } = await supabase.from('api_keys').update(updates).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
