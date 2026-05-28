import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 读取前先清理 1 天前的旧记录
    await supabase
      .from('history')
      .delete()
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { data, error } = await supabase
      .from('history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ success: true, records: data || [] });
  } catch (err: any) {
    console.error('History error:', err);
    return NextResponse.json({ error: err.message || '获取历史记录失败' }, { status: 500 });
  }
}
