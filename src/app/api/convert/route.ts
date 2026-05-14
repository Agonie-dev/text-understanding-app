import { NextRequest, NextResponse } from 'next/server';
import { convertWordToPdf, convertPdfToWord } from '@/lib/converter';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const targetFormat = formData.get('targetFormat') as string;

    if (!file || !targetFormat) {
      return NextResponse.json({ error: '缺少文件或目标格式' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = file.name.split('.').pop()?.toLowerCase();

    const recordRes = await supabase
      .from('history')
      .insert({
        filename: file.name,
        file_size: file.size,
        file_type: file.type,
        operation_type: 'convert',
        status: 'processing',
      })
      .select()
      .single();

    const recordId = recordRes.data?.id;

    let resultBuffer: Buffer;
    let outputFilename: string;

    if (targetFormat === 'pdf' && (ext === 'docx' || ext === 'doc')) {
      resultBuffer = await convertWordToPdf(buffer);
      outputFilename = file.name.replace(/\.docx?$/i, '.pdf');
    } else if (targetFormat === 'docx' && ext === 'pdf') {
      resultBuffer = await convertPdfToWord(buffer);
      outputFilename = file.name.replace(/\.pdf$/i, '.docx');
    } else {
      return NextResponse.json({ error: '不支持的转换类型' }, { status: 400 });
    }

    const base64 = resultBuffer.toString('base64');

    await supabase
      .from('history')
      .update({
        status: 'completed',
        result_url: base64,
      })
      .eq('id', recordId);

    return NextResponse.json({
      success: true,
      filename: outputFilename,
      base64,
      recordId,
    });
  } catch (err: any) {
    console.error('Convert error:', err);
    return NextResponse.json({ error: err.message || '转换失败' }, { status: 500 });
  }
}
