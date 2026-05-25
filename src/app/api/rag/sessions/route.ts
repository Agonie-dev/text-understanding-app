import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/rag/sessions?document_id=xxx
// POST /api/rag/sessions { document_id, title? }
// DELETE /api/rag/sessions?id=xxx

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('document_id');

    if (!documentId) {
      return NextResponse.json({ error: '缺少 document_id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*, chat_messages(count)')
      .eq('document_id', documentId)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { document_id, title } = await req.json();

    if (!document_id) {
      return NextResponse.json({ error: '缺少 document_id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ document_id, title: title || '新会话' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    }

    const { error } = await supabase.from('chat_sessions').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
