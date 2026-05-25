import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/fileProcessor';
import {
  convertWordToPdf,
  generateSummaryPdf,
  generateTextToDocx,
  generateTextToHtml,
  generateTextToMarkdown,
  generateTextToTxt,
} from '@/lib/converter';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const targetFormat = (formData.get('targetFormat') as string)?.toLowerCase();

    if (!file || !targetFormat) {
      return NextResponse.json({ error: '缺少文件或目标格式' }, { status: 400 });
    }

    const allowedExts = ['.pdf', '.docx', '.doc', '.txt', '.md', '.markdown'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: '不支持的文件格式' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

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
    let mimeType: string;

    // 特判：DOCX → PDF 保留图片（不走纯文本链路）
    const isWordToPdf =
      targetFormat === 'pdf' && (ext === '.docx' || ext === '.doc');

    if (isWordToPdf) {
      resultBuffer = await convertWordToPdf(buffer);
      outputFilename = file.name.replace(/\.docx?$/i, '.pdf');
      mimeType = 'application/pdf';
    } else {
      // 通用纯文本链路
      const { text } = await extractTextFromFile(
        buffer,
        file.type || 'application/octet-stream',
        file.name
      );
      if (!text || text.trim().length === 0) {
        return NextResponse.json(
          { error: '无法从文件中提取文本内容' },
          { status: 400 }
        );
      }

      switch (targetFormat) {
        case 'pdf':
          resultBuffer = await generateSummaryPdf(text);
          outputFilename = file.name.replace(/\.[^.]+$/, '') + '.pdf';
          mimeType = 'application/pdf';
          break;
        case 'docx':
          resultBuffer = await generateTextToDocx(text);
          outputFilename = file.name.replace(/\.[^.]+$/, '') + '.docx';
          mimeType =
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case 'html':
          resultBuffer = await generateTextToHtml(text, file.name);
          outputFilename = file.name.replace(/\.[^.]+$/, '') + '.html';
          mimeType = 'text/html';
          break;
        case 'md':
        case 'markdown':
          resultBuffer = generateTextToMarkdown(text);
          outputFilename = file.name.replace(/\.[^.]+$/, '') + '.md';
          mimeType = 'text/markdown';
          break;
        case 'txt':
          resultBuffer = generateTextToTxt(text);
          outputFilename = file.name.replace(/\.[^.]+$/, '') + '.txt';
          mimeType = 'text/plain';
          break;
        default:
          return NextResponse.json(
            { error: '不支持的目标格式: ' + targetFormat },
            { status: 400 }
          );
      }
    }

    const base64 = resultBuffer.toString('base64');

    await supabase
      .from('history')
      .update({ status: 'completed', result_url: base64 })
      .eq('id', recordId);

    return NextResponse.json({
      success: true,
      filename: outputFilename,
      base64,
      mimeType,
      recordId,
    });
  } catch (err: any) {
    console.error('Convert error:', err);
    return NextResponse.json(
      { error: err.message || '转换失败' },
      { status: 500 }
    );
  }
}
