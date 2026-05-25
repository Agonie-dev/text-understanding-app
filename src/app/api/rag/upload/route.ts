import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/fileProcessor';
import { supabase } from '@/lib/supabase';

const MAX_TEXT_LENGTH = 80000; // 约 80K 字符，控制在 128K tokens 以内

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    const allowedExts = ['.pdf', '.docx', '.doc', '.txt', '.md', '.markdown'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: '不支持的文件格式' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '文件大小超过 20MB' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { text, isScanned } = await extractTextFromFile(
      buffer,
      file.type || 'application/octet-stream',
      file.name
    );

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: isScanned ? '扫描版 PDF 暂不支持问答，请先 OCR 处理' : '无法从文件中提取文本' },
        { status: 400 }
      );
    }

    const isTruncated = text.length > MAX_TEXT_LENGTH;
    const extractedText = isTruncated ? text.slice(0, MAX_TEXT_LENGTH) : text;

    const { data, error } = await supabase
      .from('chat_documents')
      .insert({
        filename: file.name,
        file_size: file.size,
        extracted_text: extractedText,
        is_truncated: isTruncated,
        original_length: text.length,
      })
      .select()
      .single();

    if (error) {
      console.error('Insert chat_document error:', error);
      return NextResponse.json({ error: '保存文档失败: ' + error.message }, { status: 500 });
    }

    // 同时创建一个默认会话
    const { data: sessionData, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        document_id: data.id,
        title: '新会话',
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Insert session error:', sessionError);
    }

    return NextResponse.json({
      success: true,
      documentId: data.id,
      sessionId: sessionData?.id,
      filename: file.name,
      isTruncated,
      originalLength: text.length,
      extractedLength: extractedText.length,
    });
  } catch (err: any) {
    console.error('RAG upload error:', err);
    return NextResponse.json({ error: err.message || '上传失败' }, { status: 500 });
  }
}
