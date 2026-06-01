import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAllApiKeys, getActiveApiKey } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response!;

  try {
    const keys = await getAllApiKeys();
    const active = await getActiveApiKey();
    return NextResponse.json({ keys, activeKeyId: active?.id || null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response!;

  try {
    const { name, api_key, base_url, is_default } = await req.json();
    if (!name || !api_key) {
      return NextResponse.json({ error: '名称和 API Key 不能为空' }, { status: 400 });
    }

    const encrypted = encrypt(api_key);

    // 如果设为默认，先取消其他默认
    if (is_default) {
      await supabase.from('api_keys').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { data, error } = await supabase.from('api_keys').insert({
      name,
      api_key: encrypted,
      base_url: base_url || 'https://api.moonshot.cn/v1',
      is_active: true,
      is_default: !!is_default,
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
