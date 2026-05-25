import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/rag/cleanup?hours=1
// 删除超过指定小时数的旧文档及其所有会话和消息
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hours = parseInt(searchParams.get('hours') || '1', 10);

    if (isNaN(hours) || hours < 1) {
      return NextResponse.json({ error: 'hours 参数无效' }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // 查询将要删除的文档数量
    const { data: toDelete, error: countErr } = await supabase
      .from('chat_documents')
      .select('id')
      .lt('created_at', cutoff);

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    const count = toDelete?.length || 0;

    if (count === 0) {
      return NextResponse.json({ success: true, deleted: 0, message: '没有需要清理的旧文档' });
    }

    // 执行删除（级联删除会话和消息）
    const { error } = await supabase
      .from('chat_documents')
      .delete()
      .lt('created_at', cutoff);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: count,
      hours,
      cutoff,
      message: `已清理 ${count} 条超过 ${hours} 小时的旧文档`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
