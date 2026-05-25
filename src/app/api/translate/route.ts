import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/fileProcessor';
import { callKimiChat } from '@/lib/kimi';

const MAX_TRANSLATE_LENGTH = 80000;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const targetLang = (formData.get('targetLang') as string) || 'zh'; // zh 或 en

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
        { error: isScanned ? '扫描版 PDF OCR 识别失败' : '无法从文件中提取文本' },
        { status: 400 }
      );
    }

    // 截断
    const isTruncated = text.length > MAX_TRANSLATE_LENGTH;
    const sourceText = isTruncated ? text.slice(0, MAX_TRANSLATE_LENGTH) : text;

    // 翻译
    const isEnglish = /^[\x00-\x7F\s\n]{0,500}[a-zA-Z]{3,}/.test(sourceText.slice(0, 500));
    const detectedLang = isEnglish ? 'en' : 'zh';

    if (detectedLang === targetLang) {
      return NextResponse.json({
        error: `文档已经是${targetLang === 'zh' ? '中文' : '英文'}，无需翻译`,
        detectedLang,
      }, { status: 400 });
    }

    const systemPrompt = targetLang === 'zh'
      ? `你是一位专业的英译中翻译专家。请将以下英文文档翻译为流畅、准确的中文。保持原文的段落结构和专业术语的准确性。`
      : `你是一位专业的中译英翻译专家。请将以下中文文档翻译为流畅、准确的英文。保持原文的段落结构和专业术语的准确性。`;

    // 分段翻译
    const chunks: string[] = [];
    const CHUNK_SIZE = 6000;
    for (let i = 0; i < sourceText.length; i += CHUNK_SIZE) {
      chunks.push(sourceText.slice(i, i + CHUNK_SIZE));
    }

    const translatedChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const translated = await callKimiChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请翻译以下文档内容（第 ${i + 1}/${chunks.length} 段）：\n\n${chunk}` },
      ]);
      translatedChunks.push(translated);
    }

    const translatedText = translatedChunks.join('\n\n');

    return NextResponse.json({
      success: true,
      filename: file.name,
      originalText: sourceText,
      translatedText,
      detectedLang,
      targetLang,
      isTruncated,
      originalLength: text.length,
    });
  } catch (err: any) {
    console.error('Translate error:', err);
    return NextResponse.json({ error: err.message || '翻译失败' }, { status: 500 });
  }
}
