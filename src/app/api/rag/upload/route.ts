import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    // 只测试 supabase client 创建
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase 环境变量未配置' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 简单 ping 一下
    const { data, error } = await supabase.from('chat_documents').select('count').single();

    return NextResponse.json({
      success: true,
      supabasePing: error ? 'error: ' + error.message : 'ok',
      envUrl: supabaseUrl.slice(0, 20) + '...',
      envKey: supabaseKey.slice(0, 10) + '...',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '失败', stack: err.stack },
      { status: 500 }
    );
  }
}
