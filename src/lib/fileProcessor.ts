import mammoth from 'mammoth';

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; isScanned: boolean }> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'docx' || ext === 'doc' || mimeType.includes('word')) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, isScanned: false };
  }

  if (ext === 'pdf' || mimeType.includes('pdf')) {
    return extractFromPdf(buffer);
  }

  throw new Error('不支持的文件格式');
}

async function extractFromPdf(buffer: Buffer): Promise<{ text: string; isScanned: boolean }> {
  try {
    const pdfParseModule: any = await import('pdf-parse/lib/pdf-parse.js');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim() || '';

    if (text.length > 50) {
      return { text, isScanned: false };
    }

    return { text: '', isScanned: true };
  } catch (e: any) {
    console.error('pdfParse error:', e.message);
    return { text: '', isScanned: true };
  }
}
