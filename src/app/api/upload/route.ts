import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/fileProcessor';
import { supabase } from '@/lib/supabase';
import { createHash } from 'crypto';

const MAX_TEXT_LENGTH = 80000;

function computeMD5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

function truncateByParagraphs(text: string, maxLength: number): { text: string; truncated: boolean; originalLength: number } {
  if (text.length <= maxLength) {
    return { text, truncated: false, originalLength: text.length };
  }
  // 按段落智能截断
  const paragraphs = text.split(/\n\s*\n/);
  let result = '';
  for (const para of paragraphs) {
    if ((result + para).length > maxLength) break;
    result += (result ? '\n\n' : '') + para;
  }
  // 如果按段落截断后还是空或太短，直接硬截断
  if (result.length < maxLength * 0.5) {
    result = text.slice(0, maxLength);
  }
  return { text: result, truncated: true, originalLength: text.length };
}

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
      'text/plain',
      'text/markdown',
    ];
    const allowedExts = ['.pdf', '.docx', '.txt', '.md', '.markdown'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      return NextResponse.json({ error: '仅支持 Word (.docx)、PDF、TXT 和 Markdown 文件' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 1. 计算 MD5
    const md5 = computeMD5(buffer);
    console.log('File MD5:', md5);

    // 2. 查缓存（24小时内）
    const cacheSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from('file_cache')
      .select('*')
      .eq('md5', md5)
      .gte('created_at', cacheSince)
      .maybeSingle();

    if (cached) {
      console.log('Cache hit for MD5:', md5);
      await supabase.from('history').insert({
        filename: file.name,
        file_size: file.size,
        file_type: file.type || ext,
        operation_type: 'upload',
        status: 'completed',
      });
      return NextResponse.json({
        success: true,
        id: cached.id,
        filename: file.name,
        size: file.size,
        type: file.type || ext,
        text: cached.text,
        isScanned: cached.is_scanned,
        isTruncated: cached.is_truncated,
        originalLength: cached.original_length,
        cacheHit: true,
      });
    }

    const { text, isScanned, kimiFileId } = await extractTextFromFile(buffer, file.type, file.name);
    console.log('Extracted text length:', text.length, 'isScanned:', isScanned);

    // 4. 扫描版PDF / 无法提取 → 尝试 OCR，若 OCR 也失败则报错
    if (text.length === 0) {
      return NextResponse.json(
        { error: isScanned ? '扫描版 PDF OCR 识别失败，请尝试其他文件' : '无法从文件中提取文本内容' },
        { status: 400 }
      );
    }

    // 5. 截断处理（超过80000字）
    const { text: truncatedText, truncated, originalLength } = truncateByParagraphs(text, MAX_TEXT_LENGTH);

    // 6. 存入缓存（扫描件也缓存）
    const { error: cacheError } = await supabase.from('file_cache').insert({
      md5,
      filename: file.name,
      file_size: file.size,
      text: truncatedText,
      is_scanned: isScanned,
      is_truncated: truncated,
      original_length: originalLength,
    });

    if (cacheError) console.error('Cache insert error:', cacheError);

    // 7. 记录历史
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
      text: truncatedText,
      isScanned,
      isTruncated: truncated,
      originalLength,
      cacheHit: false,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: err.message || '上传失败', stack: err.stack, name: err.name },
      { status: 500 }
    );
  }
}
