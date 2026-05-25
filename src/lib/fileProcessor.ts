import mammoth from 'mammoth';
import { uploadFileToKimi, extractTextWithKimiOCR } from './kimi';

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; isScanned: boolean; kimiFileId?: string }> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    return { text: buffer.toString('utf-8'), isScanned: false };
  }

  if (ext === 'docx' || ext === 'doc' || mimeType.includes('word')) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, isScanned: false };
  }

  if (ext === 'pdf' || mimeType.includes('pdf')) {
    return extractFromPdf(buffer, filename);
  }

  throw new Error('不支持的文件格式');
}

async function extractFromPdf(buffer: Buffer, filename: string): Promise<{ text: string; isScanned: boolean; kimiFileId?: string }> {
  try {
    // @ts-ignore: pdf-parse index.js has debug code that crashes in serverless
    const pdfParseModule: any = await import('pdf-parse/lib/pdf-parse.js');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim() || '';

    if (text.length > 50) {
      return { text, isScanned: false };
    }

    // 扫描件 → 上传 Kimi 做 OCR
    const kimiFileId = await uploadFileToKimi(buffer, filename);
    const ocrText = await extractTextWithKimiOCR(kimiFileId);

    if (ocrText && ocrText.trim().length > 50) {
      return { text: ocrText.trim(), isScanned: true, kimiFileId };
    }

    return { text: '', isScanned: true, kimiFileId };
  } catch (e: any) {
    console.error('pdfParse error:', e.message);
    return { text: '', isScanned: true };
  }
}
