import mammoth from 'mammoth';
import { uploadFileToKimi, extractTextWithKimiOCR } from './kimi';

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';
const KIMI_API_KEY = process.env.KIMI_API_KEY!;

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
  // PDF 直接走 Kimi API，避免本地解析库在 serverless 环境下崩溃
  try {
    const kimiFileId = await uploadFileToKimi(buffer, filename);

    // 先尝试用 Kimi file-extract 接口获取文本
    const res = await fetch(`${KIMI_BASE_URL}/files/${kimiFileId}/content`, {
      headers: { 'Authorization': `Bearer ${KIMI_API_KEY}` },
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.content?.trim() || '';
      if (text.length > 50) {
        return { text, isScanned: false, kimiFileId };
      }
    }

    // 如果提取的文本太短，说明是扫描件，走 OCR
    const ocrText = await extractTextWithKimiOCR(kimiFileId);
    if (ocrText && ocrText.trim().length > 50) {
      return { text: ocrText.trim(), isScanned: true, kimiFileId };
    }

    return { text: '', isScanned: true, kimiFileId };
  } catch (e: any) {
    console.error('PDF processing error:', e.message);
    return { text: '', isScanned: true };
  }
}
