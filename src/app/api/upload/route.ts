import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/fileProcessor';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '未找到文件' }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小超过 20MB 限制' }, { status: 400 });
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const allowedExts = ['.pdf', '.doc', '.docx'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      return NextResponse.json({ error: '仅支持 Word 和 PDF 文件' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { text, isScanned } = await extractTextFromFile(buffer, file.type, file.name);

    const { data, error } = await supabase
      .from('history')
      .insert({
        filename: file.name,
        file_size: file.size,
        file_type: file.type || ext,
        operation_type: 'upload',
        status: 'completed',
      })
      .select()
      .single();

    if (error) console.error('Supabase insert error:', error);

    return NextResponse.json({
      success: true,
      id: data?.id,
      filename: file.name,
      size: file.size,
      type: file.type || ext,
      text: text.slice(0, 5000),
      isScanned,
      fullTextLength: text.length,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: err.message || '上传失败', stack: err.stack, name: err.name },
      { status: 500 }
    );
  }
}
