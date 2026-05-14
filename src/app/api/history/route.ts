import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
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
