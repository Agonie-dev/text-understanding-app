import { NextRequest, NextResponse } from 'next/server';
import { summarizeText } from '@/lib/kimi';
import { generateSummaryDocx } from '@/lib/docxGenerator';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { text, filename } = await req.json();

    if (!text || text.length < 10) {
      return NextResponse.json({ error: '文本内容太短，无法总结' }, { status: 400 });
    }

    const recordRes = await supabase
      .from('history')
      .insert({
        filename: filename || '未命名文件',
        file_size: 0,
        file_type: 'text/summary',
        operation_type: 'summarize',
        status: 'processing',
      })
      .select()
      .single();

    const recordId = recordRes.data?.id;

    const summary = await summarizeText(text);

    const docxBuffer = await generateSummaryDocx(summary);
    const docxBase64 = docxBuffer.toString('base64');

    await supabase
      .from('history')
      .update({
        status: 'completed',
        summary_text: summary,
        result_url: docxBase64,
      })
      .eq('id', recordId);

    return NextResponse.json({
      success: true,
      summary,
      docxBase64,
      recordId,
    });
  } catch (err: any) {
    console.error('Summarize error:', err);
    return NextResponse.json({ error: err.message || '总结失败' }, { status: 500 });
  }
}
