import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractTextFromFile } from '@/lib/fileProcessor';

const MAX_TEXT_LENGTH = 80000;

export async function POST(req: NextRequest) {
  try {
    // 安全检查环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase 环境变量未配置', step: 'env_check' },
        { status: 500 }
      );
    }

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

    // 步骤1：提取文本
    let extractResult;
    try {
      extractResult = await extractTextFromFile(
        buffer,
        file.type || 'application/octet-stream',
        file.name
      );
    } catch (extractErr: any) {
      console.error('Extract error:', extractErr);
      return NextResponse.json(
        { error: '文本提取失败: ' + extractErr.message, step: 'extract' },
        { status: 500 }
      );
    }

    const { text, isScanned, kimiFileId } = extractResult;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: isScanned ? '扫描版 PDF OCR 识别失败，请尝试其他文件' : '无法从文件中提取文本内容' },
        { status: 400 }
      );
    }

    const isTruncated = text.length > MAX_TEXT_LENGTH;
    const extractedText = isTruncated ? text.slice(0, MAX_TEXT_LENGTH) : text;

    // 步骤2：创建 Supabase client（直接在路由里，不用模块）
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 步骤3：插入 chat_documents
    let docData;
    try {
      const { data, error } = await supabase
        .from('chat_documents')
        .insert({
          filename: file.name,
          file_size: file.size,
          extracted_text: extractedText,
          is_truncated: isTruncated,
          original_length: text.length,
          kimi_file_id: kimiFileId || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Insert chat_document error:', error);
        return NextResponse.json(
          { error: '保存文档失败: ' + error.message, code: error.code, step: 'insert_doc' },
          { status: 500 }
        );
      }
      docData = data;
    } catch (dbErr: any) {
      console.error('DB insert error:', dbErr);
      return NextResponse.json(
        { error: '数据库插入失败: ' + dbErr.message, step: 'insert_doc' },
        { status: 500 }
      );
    }

    // 步骤4：创建默认会话
    let sessionData;
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          document_id: docData.id,
          title: '新会话',
        })
        .select()
        .single();

      if (error) {
        console.error('Insert session error:', error);
      } else {
        sessionData = data;
      }
    } catch (sessionErr: any) {
      console.error('Session insert error:', sessionErr);
    }

    return NextResponse.json({
      success: true,
      documentId: docData.id,
      sessionId: sessionData?.id,
      filename: file.name,
      isTruncated,
      originalLength: text.length,
      extractedLength: extractedText.length,
    });
  } catch (err: any) {
    console.error('RAG upload fatal error:', err);
    return NextResponse.json(
      { error: err.message || '上传失败', step: 'fatal' },
      { status: 500 }
    );
  }
}
